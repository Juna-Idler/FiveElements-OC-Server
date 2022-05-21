'use strict';
const fs = require("fs");

class CardData
{
	constructor(id,element,power)
	{
		this.ID = id;
		this.Element = element;
		this.Power = power;
	}
}
class CardCatalog
{
	constructor()
	{
		const json = fs.readFileSync("cardcatalog.json", "utf8");
		const catalog = JSON.parse(json);
		this.catalog = catalog.CardCatalog;
		this.version = catalog.version;
	}
	Get(id)
	{
		return this.catalog[id];
	}
}

//通信データの構造
const senddata =
{
	p : 0,//phase count 雑に言えばターン数 偶数BattlePhase 奇数DamagePhase マイナスGameEnd
	d : 0,//damage 前回のBattlePhaseで発生したダメージ ＋自分にダメージ －相手にダメージ
	y ://your data 自分（このデータを受け取った側）の差分データ
	{
		d : [],//draw cards ドローしたカードのIDの配列
		s : 0,//selected hand index 前回選んだ手札の位置
		c : 0,//deckcount デッキ残り枚数 最初のデッキ枚数を別の手段で確定できるなら省略可能
	},
	r : {d : [],s : 0,c : 0},//rival data 対戦相手の差分データ

	a:"",//abort 何か文字が入っていれば強制終了
}
//まあサイズ気にするなら最終的にバイナリになる可能性

class PlayerData
{
	constructor()
	{
		const shuffle = ([...array]) => {
			for (let i = array.length - 1; i >= 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
			return array;
		}

		let deck = [];
		for (let i = 0;i < 5;i++)
		{
			deck.push(i + 1);
			deck.push(i + 1);
			deck.push(i + 1);
			deck.push(i + 1 + 5);
			deck.push(i + 1 + 10);
		}
		this.deck = shuffle(deck);
		
		this.hand = [];
		this.draw = [];
		for (let i = 0;i < 4;i++)
		{
			this.DrawCard();
		}
		
		this.damage = [];
		this.used = [];
		this.select = -1;
	}
	DrawCard()
	{
		if (this.deck.length > 0)
		{
			const c = this.deck.pop();
			this.draw.push(c);
			this.hand.push(c);
		}
	}
}

//const Phases = { BattlePhase:0 , DamagePhase:1 , GameEnd:2};


class GameMaster
{
	static CardCatalog =  new CardCatalog();
	static CC = GameMaster.CardCatalog.catalog;
	constructor()
	{
		this.phase = 0;
		this.damage = 0;
		this.player1 = new PlayerData();
		this.player2 = new PlayerData();

		this.MakeResultData();
	}

	SetP1Select(phase,index){if (phase==this.phase)this.player1.select = index;}
	SetP2Select(phase,index){if (phase==this.phase)this.player2.select = index;}

	Selected()
	{
		if (this.phase & 1)
		{
			if ((this.damage > 0 && this.player1.select >= 0) ||
				(this.damage < 0 && this.player2.select >= 0))
			return true;
		}
		else
			return this.player1.select >= 0 && this.player2.select >= 0;
	}

	Decide()
	{
        this.player1.select = Math.min(Math.max(0, this.player1.select), this.player1.hand.length - 1);
        this.player2.select = Math.min(Math.max(0, this.player2.select), this.player2.hand.length - 1);
		this.player1.draw = [];
		this.player2.draw = [];

		if (this.phase < 0)
		{
			this.player1.select = this.player2.select = -1;
			return [{},{}];
		}

		if (this.phase & 1)
			this.Damage();
		else
			this.Battle();
		this.MakeResultData();
		this.player1.select = this.player2.select = -1;


		return [this.p1result,this.p2result];
	}

	MakeResultData()
	{
		const p1 = {d:this.player1.draw,s:this.player1.select,c:this.player1.deck.length};
		const p2 = {d:this.player2.draw,s:this.player2.select,c:this.player2.deck.length};

		this.p1result = JSON.stringify({ p: this.phase, d: this.damage,y:p1,r:p2,});
		this.p2result = JSON.stringify({ p: this.phase, d: -this.damage,y:p2,r:p1,});
	}

	Battle()
	{
		const battle1 = GameMaster.CC[this.player1.hand[this.player1.select]];
		const battle2 = GameMaster.CC[this.player2.hand[this.player2.select]];

		this.player1.hand.splice(this.player1.select,1);
		this.player2.hand.splice(this.player2.select,1);

		const support1 = this.player1.used.length == 0 ? null : GameMaster.CC[this.player1.used[this.player1.used.length-1]];
        const support2 = this.player2.used.length == 0 ? null : GameMaster.CC[this.player2.used[this.player2.used.length-1]];

		const battleresult = GameMaster.Judge(battle1,battle2,support1,support2);
		const p1damage = (battleresult < 0);
		const p2damage = (battleresult > 0)
		this.damage = p1damage - p2damage;

        const life1 = this.player1.hand.length + this.player1.deck.length - p1damage;
        const life2 = this.player2.hand.length + this.player2.deck.length - p2damage;
        if (life1 <= 0 || life2 <= 0)
        {
			this.phase = -1;
            return;
        }
        this.player1.used.push(battle1.ID);
        this.player2.used.push(battle2.ID);

		this.player1.DrawCard();
		this.player2.DrawCard();
		if (p1damage > 0)
		{this.player1.DrawCard();}
		else if (p2damage > 0)
		{this.player2.DrawCard();}

		this.phase += 1 + (this.damage == 0);
	}	


    static Judge(a_battle, b_battle, a_support = null, b_support = null)
    {
        let a_supportpower = (a_support != null ? GameMaster.Chemistry(a_battle.Element, a_support.Element) : 0);
        let a_power = a_battle.Power + a_supportpower + GameMaster.Chemistry(a_battle.Element, b_battle.Element);
        let b_supportpower = (b_support != null ? GameMaster.Chemistry(b_battle.Element, b_support.Element) : 0);
        let b_power = b_battle.Power + b_supportpower + GameMaster.Chemistry(b_battle.Element, a_battle.Element);

        return a_power - b_power;
    }

    static table = [
            1, 0, 0,-1, 1,
            1, 1, 0, 0,-1,
           -1, 1, 1, 0, 0,
            0,-1, 1, 1, 0,
            0, 0,-1, 1, 1
	];
    static Chemistry(destelement, srcelement)
    {
        return GameMaster.table[destelement * 5 + srcelement];
    }


	Damage()
	{
        if (this.damage > 0)
        {
			this.player1.damage.push(...this.player1.hand.splice(this.player1.select,1));
        }
        else if (this.damage < 0)
        {
			this.player2.damage.push(...this.player2.hand.splice(this.player2.select,1));
        }
		this.phase++;
	}

}

module.exports = GameMaster;
