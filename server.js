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


var wait_client = null;

class GameRoom
{
    constructor(ws1,ws2,battleSec = 15,damageSec = 10)
    {
        this.game = new GameMaster();
        this.p1socket = ws1;
        this.p2socket = ws2;

		this.timeout = null;
		this.DamageTimeoutCount = damageSec * 1000 + 5000;
		this.BattleTimeoutCount = battleSec * 1000 + 5000;

        this.p1socket.send(this.game.p1result);
        this.p2socket.send(this.game.p2result);
        SetBattleTimeOut();

        console.log("GameStart:");
        console.log(this.game.p1result);
    }
    Select(ws,data)
    {
        if (ws === this.p1socket)
        {
            this.game.SetP1Select(data.phase,data.index);
            console.log("Select P1:phase " + data.phase + " index=" + data.index);
        }
        else if (ws === this.p2socket)
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
        this.p1socket.send(p1);
        this.p2socket.send(p2);
        console.log(p1);
        if (this.game.phase < 0)
        {
            this.p1socket.close(1000);
            this.p2socket.close(1000);
            console.log("Room Close");
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
            SetBattleTimeOut();
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
}

var WaitRooms = new Map();
var Rooms = new Map();

var JoinCommand = {
    command:"Join",
    wait_room_name:"???"
}
var SelectCommand = {
    command:"Select",
    phase:"phase_count",
    index:"select_hand_index"
}

wss.on('connection', (ws,req) => {
//    req.url
    console.log("connect:");
    ws.on('message', (json) => {
        const data = JSON.parse(json);
        switch (data.command)
        {
        case "Join":
            if (wait_client && wait_client.readyState == WebSocket.OPEN)
            {
                console.log("Join:Matching");
                let game = new GameRoom(wait_client,ws);
                Rooms.set(ws,game);
                Rooms.set(wait_client,game);
                wait_client = null;
            }
            else{
                wait_client = ws;

                console.log("Join:Wait");
            }
            break;
        case "Select":
            const game = Rooms.get(ws);
            game.Select(ws,data);
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
            Rooms.delete(ws);
            console.log("room delete");
        }

    });
});