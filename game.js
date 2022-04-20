'use strict';


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
				deck.push({element: i,power : j});
				deck.push({element: i,power : j});
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
		this.draw = 0;
	}
	DrawCard()
	{
		if (this.deck.length > 0)
		{
			this.hand.push(this.deck.pop());
			return 1;
		}
		return 0;
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
/*
	//通信データをそぎ落とす場合
		let minmumresult ={
			phase: this.phase,
			yourdraw : [],//このPhaseでドローしたカードのみ
			rivaldraw : [],
			yourselect: 0,
			rivalselect : 0,
			damage : 0
//デッキの枚数は初期値固定なら要らない
		}
*/
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
			this.player1.draw = 0;
			this.player2.draw = 0;
            return;
        }
        this.player1.used.push(battle1);
        this.player2.used.push(battle2);

		this.player1.draw = this.player1.DrawCard();
		this.player2.draw = this.player2.DrawCard();
		if (p1damage > 0)
		{
			this.player1.draw += this.player1.DrawCard();
		}else if (p2damage > 0){
			this.player2.draw += this.player2.DrawCard();
		}

		if (this.damage == 0)
		 {this.phase = Phases.BattlePhase;}
		else
		 {this.phase = Phases.DamagePhase;}
	}	


    static Judge(a_battle, b_battle, a_support = null, b_support = null)
    {
        let a_supportpower = (a_support != null ? GameMaster.Chemistry(a_battle.element, a_support.element) : 0);
        let a_power = a_battle.power + a_supportpower + GameMaster.Chemistry(a_battle.element, b_battle.element);
        let b_supportpower = (b_support != null ? GameMaster.Chemistry(b_battle.element, b_support.element) : 0);
        let b_power = b_battle.power + b_supportpower + GameMaster.Chemistry(b_battle.element, a_battle.element);

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
		this.player1.draw = this.player2.draw = 0;
	}

}

module.exports = GameMaster;
