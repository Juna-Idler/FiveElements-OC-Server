'use strict';

class CardData
{
	constructor(element,power)
	{
		this.e = element;
		this.p = power;
	}
}

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
			for (let j = 1;j < 3;j++)
			{
				deck.push(new CardData(i,j));
				deck.push(new CardData(i,j));
			}
		}
		this.deck = shuffle(deck);
		
		this.hand = [];
		for (let i = 0;i < 4;i++)
		{
			this.DrawCard();
		}
		
		this.damage = [];
		this.used = [];
		this.select = -1;
		this.draw = [];
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
	Data()
	{
		return {
			hand : this.hand,
			used : this.used,
			damage : this.damage,
			decknum : this.deck.length,
			select : this.select,
			draw : this.draw
		};
	}
}

const Phases = { BattlePhase:0 , DamagePhase:1 , GameEnd:2};


class GameMaster
{
	constructor()
	{
		this.phase = Phases.BattlePhase;
		this.player1 = new PlayerData();
		this.player2 = new PlayerData();
		this.damage = 0;

		this.MakeResultData();
	}

	SetP1Select(index){this.player1.select = index;}
	SetP2Select(index){this.player2.select = index;}

	Selected()
	{
		if (this.phase == Phases.DamagePhase)
		{
			if ((this.damage > 0 && this.player1.select >= 0) ||
				(this.damage < 0 && this.player2.select >= 0))
			return true;
		}
		else
			return this.player1.select >= 0 && this.player2.select >= 0;
	}

	Deside()
	{
        this.player1.select = Math.min(Math.max(0, this.player1.select), this.player1.hand.length - 1);
        this.player2.select = Math.min(Math.max(0, this.player2.select), this.player2.hand.length - 1);
		this.player1.draw = [];
		this.player2.draw = [];

		switch(this.phase)
		{
		case Phases.BattlePhase:
			this.Battle();
			break;
		case Phases.DamagePhase:
			this.Damage();
			break;
		default:
			break;
		}
		this.MakeResultData();
		this.player1.select = this.player2.select = -1;
	
		return [this.p1result,this.p2result];
	}

	MakeResultData()
	{
		let result = {
			phase: this.phase,
			you : {},
			rival : {},
			damage : 0
		}
		const player1 = this.player1.Data();
		const player2 = this.player2.Data();

		result.you = player1;
		result.rival = player2;
		result.damage = this.damage;
		this.p1result = JSON.stringify(result);
		result.you = player2;
		result.rival = player1;
		result.damage = -this.damage;
		this.p2result = JSON.stringify(result);
	//通信データをそぎ落とす場合
		let r ={
			p: this.phase,//phase
			y :
			{
				d : [],//yourdraw
				s : 0,//yourselect
				c : 0,//yourdeckcount
			},
			r :
			{
				d : [],//rivaldraw
				s : 0,//rivalselect
				c : 0,//rivaldeckcount
			},
			d : 0//damage
		}

		const p1 = {d:this.player1.draw,s:this.player1.select,c:this.player1.deck.length};
		const p2 = {d:this.player2.draw,s:this.player2.select,c:this.player2.deck.length};

		this.p1result = JSON.stringify({p:this.phase,y:p1,r:p2,d:this.damage});
		this.p2result = JSON.stringify({p:this.phase,y:p2,r:p1,d:-this.damage});

	}

	Battle()
	{
		const battle1 = this.player1.hand[this.player1.select];
		const battle2 = this.player2.hand[this.player2.select];

		this.player1.hand.splice(this.player1.select,1);
		this.player2.hand.splice(this.player2.select,1);

		const support1 = this.player1.used.length == 0 ? null : this.player1.used[this.player1.used.length-1];
        const support2 = this.player2.used.length == 0 ? null : this.player2.used[this.player2.used.length-1];

		const battleresult = GameMaster.Judge(battle1,battle2,support1,support2);
		const p1damage = (battleresult < 0);
		const p2damage = (battleresult > 0)
		this.damage = p1damage - p2damage;

        const life1 = this.player1.hand.length + this.player1.deck.length - p1damage;
        const life2 = this.player2.hand.length + this.player2.deck.length - p2damage;
        if (life1 <= 0 || life2 <= 0)
        {
			this.phase = Phases.GameEnd;
            return;
        }
        this.player1.used.push(battle1);
        this.player2.used.push(battle2);

		this.player1.DrawCard();
		this.player2.DrawCard();
		if (p1damage > 0)
		{
			this.player1.DrawCard();
		}else if (p2damage > 0){
			this.player2.DrawCard();
		}

		if (this.damage == 0)
		 {this.phase = Phases.BattlePhase;}
		else
		 {this.phase = Phases.DamagePhase;}
	}	


    static Judge(a_battle, b_battle, a_support = null, b_support = null)
    {
        let a_supportpower = (a_support != null ? GameMaster.Chemistry(a_battle.e, a_support.e) : 0);
        let a_power = a_battle.p + a_supportpower + GameMaster.Chemistry(a_battle.e, b_battle.e);
        let b_supportpower = (b_support != null ? GameMaster.Chemistry(b_battle.e, b_support.e) : 0);
        let b_power = b_battle.p + b_supportpower + GameMaster.Chemistry(b_battle.e, a_battle.e);

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
			this.player1.damage.push(this.player1.hand.splice(this.player1.select,1));
        }
        else if (this.damage < 0)
        {
			this.player2.damage.push(this.player2.hand.splice(this.player2.select,1));
        }

		this.phase = Phases.BattlePhase;
        this.damage = 0;
	}

}

module.exports = GameMaster;
