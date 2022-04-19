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
    constructor(ws1,ws2)
    {
        this.game = new GameMaster();
        this.p1socket = ws1;
        this.p2socket = ws2;

        this.p1socket.send(this.game.p1result);
        this.p2socket.send(this.game.p2result);
    }
    Select(ws,index)
    {
        if (ws === this.p1socket)
        {
            this.game.SetP1Select(index);
            console.log("Select P1:index=" + index);
        }
        else if (ws === this.p2socket)
        {
             this.game.SetP2Select(index);
             console.log("Select P2:index=" + index);
        }
        if (this.game.Selected())
        {
            console.log("Desice:");
            const [p1,p2] = this.game.Deside();
            this.p1socket.send(p1);
            this.p2socket.send(p2);
        }
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
    index:"select_hand_index"
}

wss.on('connection', (ws) => {
    console.log("connect:");
    ws.on('message', (json) => {
        console.log("message:" + json);

        const data = JSON.parse(json);
        switch (data.command)
        {
        case "Join":
            if (wait_client && wait_client.readyState == WebSocket.OPEN)
            {
                let game = new GameRoom(wait_client,ws);
                Rooms.set(ws,game);
                Rooms.set(wait_client,game);
                wait_client = null;

                console.log("Join:Matching");
            }
            else{
                wait_client = ws;

                console.log("Join:Wait");
            }
            break;
        case "Select":
            const game = Rooms.get(ws);
            game.Select(ws,data.index);
            break;
        }

    });

    ws.on('close', () => {
        if (ws === wait_client) {
            wait_client = nulll;
        }
        if (Rooms.has(ws))
        {
            Rooms.delete(ws);
        }

    });
});