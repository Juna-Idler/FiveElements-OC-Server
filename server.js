'use strict';

const path = require('path');
const express = require('express');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = app.listen(PORT, () => console.log(`Listening on ${PORT}`));
const wss = new WebSocket.Server({ server });


const GameMaster = require("./game");



class GameInitialPlayerData
{
    constructor(name,hand,deckcount)
    {
        this.name = name;
        this.hand = hand;
        this.deckcount = deckcount;
    }
}
class ClientData
{
    constructor(ws,name)
    {
        this.ws = ws;
        this.name = name;
    }
}

var abort = {
	p : 0,	d : 0,
	y : {d : [],s : 0,c : 0},
	r : {d : [],s : 0,c : 0},
	a:"",
}

class GameRoom
{
    constructor(cd1,cd2,battleSec = 15,damageSec = 10)
    {
        this.game = new GameMaster();
        this.p1client = cd1;
        this.p2client = cd2;

		this.timeout = null;
		this.DamageTimeoutCount = damageSec * 1000 + 5000;
		this.BattleTimeoutCount = battleSec * 1000 + 5000;

        const p1initial = { name: this.p1client.name, hand:this.game.player1.hand,deckcount:this.game.player1.deck.length};
        const p2initial = { name: this.p2client.name, hand:this.game.player2.hand,deckcount:this.game.player2.deck.length};

        this.p1client.ws.send(JSON.stringify({y:p1initial,r:p2initial,battletime:battleSec,damagetime:damageSec}));
        this.p2client.ws.send(JSON.stringify({y:p2initial,r:p1initial,battletime:battleSec,damagetime:damageSec}));
        this.SetBattleTimeOut();

        console.log("GameStart:");
        console.log(this.game.p1result);
    }
    Select(ws,data)
    {
        if (ws === this.p1client.ws)
        {
            this.game.SetP1Select(data.phase,data.index);
            console.log("Select P1:phase " + data.phase + " index=" + data.index);
        }
        else if (ws === this.p2client.ws)
        {
             this.game.SetP2Select(data.phase,data.index);
             console.log("Select P2:phase " + data.phase + " index=" + data.index);
        }
        if (this.game.Selected())
        {
            if (this.timeout)
            {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
            this.Decide();
        }
    }
    Decide()
    {
        console.log("Decide:");
        const [p1,p2] = this.game.Decide();
        this.p1client.ws.send(p1);
        this.p2client.ws.send(p2);
        console.log(p1);
        if (this.game.phase < 0)
        {
            console.log("Game End");
            return;
        }
        if (this.game.phase & 1)
        {
            this.timeout = setTimeout(()=>{
                this.timeout = null;
                if (this.game.damage > 0)
                {
                    console.log("Damage Timeout:p1 not select");
                    this.game.player1.select = 0;
                }
                else if (this.game.damage < 0)
                {
                    console.log("Damage Timeout:p2 not select");
                    this.game.player2.select = 0;
                }
                this.Decide();
            },this.DamageTimeoutCount);
        }
        else
        {
            this.SetBattleTimeOut();
        }
    }
    SetBattleTimeOut()
    {
        this.timeout = setTimeout(()=>{
            this.timeout = null;
            console.log("Battle Timeout:p1=" + this.game.player1.select + " p2=" + this.game.player2.select);
            if (this.game.player1.select < 0)
                this.game.player1.select = 0;
            if (this.game.player2.select < 0)
                this.game.player2.select = 0;
            this.Decide();
        },this.BattleTimeoutCount);        
    }
    Surrender(ws)
    {
        if (this.timeout)
        {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        abort.a = "Surrender";
        if (ws == this.p1client.ws)
        {
            console.log("Surrender p1");
            abort.d = 1;
            this.p1client.ws.send(JSON.stringify(abort));
            abort.d = -1;
            this.p2client.ws.send(JSON.stringify(abort));
        }
        else if (ws == this.p2client.ws)
        {
            console.log("Surrender p2");
            abort.d = 1;
            this.p2client.ws.send(JSON.stringify(abort));
            abort.d = -1;
            this.p1client.ws.send(JSON.stringify(abort));
        }
//        setTimeout(()=>this.p1client.ws.close(1000),1000);
//        setTimeout(()=>this.p2client.ws.close(1000),1000);
    }
    Disconnect(ws)
    {
        if (this.timeout)
        {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        abort.a = "Disconnect";
        if (ws == this.p1client.ws)
        {
            if (this.p2client.ws.readyState == WebSocket.OPEN)
            {
                abort.d = -1;
                this.p2client.ws.send(JSON.stringify(abort));
            }
//            setTimeout(()=>this.p2client.ws.close(1000),1000);
        }
        else if (ws == this.p2client.ws)
        {
            if (this.p1client.ws.readyState == WebSocket.OPEN)
            {
                abort.d = -1;
                this.p1client.ws.send(JSON.stringify(abort));
            }
//            setTimeout(()=>this.p1client.ws.close(1000),1000);
        }
    }
    Terminalize()
    {
        if (this.timeout)
            clearTimeout(this.timeout);

        abort.d = 0;
        abort.a = "Term";

        this.p1client.ws.send(JSON.stringify(abort));
        this.p2client.ws.send(JSON.stringify(abort));
//        setTimeout(()=>this.p1client.ws.close(1000),1000);
//        setTimeout(()=>this.p2client.ws.close(1000),1000);
    }
}

var wait_client = null;
var WaitRooms = new Map();
var Rooms = new Map();

var JoinCommand = {
    command:"Join",
    wait_room_name:"???",
    playername:""
}
var SelectCommand = {
    command:"Select",
    phase:"phase_count",
    index:"select_hand_index"
}
var EndCommand = {
    command:"End",
    reason:"",
    message:""
}


wss.on('connection', (ws,req) => {
//    req.url
    console.log("connect:");
    ws.on('message', (json) => {
        const data = JSON.parse(json);
        switch (data.command)
        {
        case "Join":
            if (wait_client && wait_client.ws.readyState == WebSocket.OPEN)
            {
                console.log("Join:Matching");
                let game = new GameRoom(wait_client,new ClientData(ws,data.playername));
                Rooms.set(ws,game);
                Rooms.set(wait_client.ws,game);
                wait_client = null;
            }
            else{
                wait_client = new ClientData(ws,data.playername);
                console.log("Join:Wait");
            }
            break;
        case "Select":
            {
                const game = Rooms.get(ws);
                game?.Select(ws,data);
            }
            break;
        case "End":
            {
                const game = Rooms.get(ws);
                if (game)
                {
                    Rooms.delete(game.p1client.ws);
                    Rooms.delete(game.p2client.ws);
                    game.Surrender(ws);
                }
            }
            break;
        }

    });

    ws.on('close', () => {
        console.log("connection:close");
        if (ws === wait_client) {
            wait_client = null;
        }
        if (Rooms.has(ws))
        {
            const game = Rooms.get(ws);
            Rooms.delete(game.p1client.ws);
            Rooms.delete(game.p2client.ws);
            game.Disconnect(ws);
        }

    });
});