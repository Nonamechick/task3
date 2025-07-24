const crypto = require('crypto');
const { table } = require('table');


class Dice {
    constructor(faces) {
        if (!faces || faces.length === 0) {
            throw new Error("Dice must have at least one face");
        }
        this.faces = faces.map(face => parseInt(face));
        this.validateFaces();
    }

    validateFaces() {
        if (this.faces.some(isNaN)) {
            throw new Error("Dice faces must be integers");
        }
    }

    roll(randomValue) {
        return this.faces[randomValue % this.faces.length];
    }

    toString() {
        return `[${this.faces.join(',')}]`;
    }
}

class FairRandomGenerator {
    constructor() {
        this.key = crypto.randomBytes(32); // 256-bit key
        this.value = null;
        this.hmac = null;
    }

    generateRandomValue(max) {
        this.value = Math.floor(Math.random() * (max + 1));
        this.hmac = crypto.createHmac('sha256', this.key)
                          .update(this.value.toString())
                          .digest('hex');
        return this.hmac;
    }

    getResult(userValue) {
        const sum = (this.value + userValue) % (this.faces || 6);
        return {
            computerValue: this.value,
            key: this.key.toString('hex'),
            result: sum
        };
    }
}

class ProbabilityCalculator {
    static calculateWinProbability(dice1, dice2) {
        let wins = 0;
        const totalCombinations = dice1.faces.length * dice2.faces.length;
        
        for (const face1 of dice1.faces) {
            for (const face2 of dice2.faces) {
                if (face1 > face2) wins++;
            }
        }
        
        return wins / totalCombinations;
    }

    static generateProbabilityTable(diceList) {
        const headerRow = ['User dice \\ Computer dice', ...diceList.map(d => d.toString())];
        const tableData = [headerRow];
        
        for (let i = 0; i < diceList.length; i++) {
            const row = [diceList[i].toString()];
            for (let j = 0; j < diceList.length; j++) {
                if (i === j) {
                    row.push('[·]');
                } else {
                    const prob = this.calculateWinProbability(diceList[i], diceList[j]);
                    row.push(prob.toFixed(4));
                }
            }
            tableData.push(row);
        }
        
        return table(tableData, {
            header: {
                alignment: 'center',
                content: 'Probability of Winning'
            },
            border: {
                topBody: `─`,
                topJoin: `┬`,
                topLeft: `┌`,
                topRight: `┐`,

                bottomBody: `─`,
                bottomJoin: `┴`,
                bottomLeft: `└`,
                bottomRight: `┘`,

                bodyLeft: `│`,
                bodyRight: `│`,
                bodyJoin: `│`,

                joinBody: `─`,
                joinLeft: `├`,
                joinRight: `┤`,
                joinJoin: `┼`
            },
            columns: {
                0: { width: 30, alignment: 'left' },
                ...Object.fromEntries(
                    Array.from({ length: diceList.length }, (_, i) => [i + 1, { width: 10, alignment: 'right' }])
                )
            }
        });
    }
}

class DiceGame {
    constructor(diceConfigs) {
        if (diceConfigs.length < 3) {
            throw new Error("At least 3 dice must be provided");
        }
        
        this.diceList = diceConfigs.map(config => new Dice(config.split(',')));
        this.userDice = null;
        this.computerDice = null;
        this.userRoll = null;
        this.computerRoll = null;
    }

    async determineFirstMove() {
        console.log("Let's determine who makes the first move.");
        const generator = new FairRandomGenerator();
        const hmac = generator.generateRandomValue(1);
        
        console.log(`I selected a random value in the range 0..1`);
        console.log(`(HMAC: ${hmac})`);
        console.log(`Try to guess my selection.`);
        
        const userValue = await this.getUserInput(['0', '1'], "Your selection: ");
        const { computerValue, key, result } = generator.getResult(parseInt(userValue));
        
        console.log(`My selection: ${computerValue} (KEY=${key})`);
        console.log(`The fair number generation result is ${computerValue} + ${userValue} = ${result} (mod 2)`);
        
        return result === 0; 
    }

    async play() {
        try {
            console.log("Welcome to the Non-Transitive Dice Game!");
            console.log("----------------------------------------");
            
            
            console.log("\nProbability Table:");
            console.log(ProbabilityCalculator.generateProbabilityTable(this.diceList));
            
            const computerFirst = await this.determineFirstMove();
            
            if (computerFirst) {
                await this.computerSelectsDice();
                await this.userSelectsDice();
            } else {
                await this.userSelectsDice();
                await this.computerSelectsDice();
            }
            
            await this.performRolls();
            this.determineWinner();
            
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    async computerSelectsDice() {
        const availableDice = this.diceList.filter(d => d !== this.userDice);
        const randomIndex = Math.floor(Math.random() * availableDice.length);
        this.computerDice = availableDice[randomIndex];
        console.log(`I make the first move and choose the ${this.computerDice} dice.`);
    }

    async userSelectsDice() {
        const options = this.diceList
            .map((d, i) => `${i} = ${d}`)
            .concat(['X = exit', '? = help']);
        
        console.log("Choose your dice:");
        console.log(options.join('\n'));
        
        const validChoices = this.diceList
            .map((_, i) => i.toString())
            .concat(['x', '?']);
            
        const selection = await this.getUserInput(validChoices, "Your selection: ");
        
        if (selection === '?') {
            console.log("\nProbability Table:");
            console.log(ProbabilityCalculator.generateProbabilityTable(this.diceList));
            return this.userSelectsDice();
        }
        
        if (selection === 'x') {
            console.log("Game exited by user.");
            process.exit(0);
        }
        
        this.userDice = this.diceList[parseInt(selection)];
        console.log(`You choose the ${this.userDice} dice.`);
    }

    async performRolls() {
        // User roll
        console.log("\nIt's time for your roll.");
        const userRollResult = await this.performFairRoll(0, this.userDice.faces.length - 1, "your");
        this.userRoll = this.userDice.roll(userRollResult);
        
        // Computer roll
        console.log("\nIt's time for my roll.");
        const computerRollResult = await this.performFairRoll(0, this.computerDice.faces.length - 1, "my");
        this.computerRoll = this.computerDice.roll(computerRollResult);
    }

    async performFairRoll(min, max, owner) {
        const generator = new FairRandomGenerator();
        const hmac = generator.generateRandomValue(max);
        
        console.log(`I selected a random value in the range ${min}..${max}`);
        console.log(`(HMAC: ${hmac})`);
        console.log(`Add your number modulo ${max + 1}.`);
        
        const options = Array.from({ length: max + 1 }, (_, i) => `${i} = ${i}`)
                            .concat(['X = exit', '? = help']);
        console.log(options.join('\n'));
        
        const validChoices = Array.from({ length: max + 1 }, (_, i) => i.toString())
                                .concat(['x', '?']);
        
        const userValue = await this.getUserInput(validChoices, "Your selection: ");
        
        if (userValue === '?') {
            console.log("\nProbability Table:");
            console.log(ProbabilityCalculator.generateProbabilityTable(this.diceList));
            return this.performFairRoll(min, max, owner);
        }
        
        if (userValue === 'x') {
            console.log("Game exited by user.");
            process.exit(0);
        }
        
        const { computerValue, key, result } = generator.getResult(parseInt(userValue));
        console.log(`${owner} number is ${computerValue} (KEY=${key})`);
        console.log(`The fair number generation result is ${computerValue} + ${userValue} = ${result} (mod ${max + 1})`);
        
        return result;
    }

    determineWinner() {
        console.log(`\nYour roll result is ${this.userRoll}.`);
        console.log(`My roll result is ${this.computerRoll}.`);
        
        if (this.userRoll > this.computerRoll) {
            console.log("You win!");
        } else if (this.userRoll < this.computerRoll) {
            console.log("I win!");
        } else {
            console.log("It's a tie!");
        }
    }

    async getUserInput(validChoices, prompt) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise(resolve => {
            const ask = () => {
                readline.question(prompt, answer => {
                    const lowerAnswer = answer.toLowerCase();
                    if (validChoices.includes(lowerAnswer)) {
                        readline.close();
                        resolve(lowerAnswer);
                    } else {
                        console.log("Invalid selection. Please try again.");
                        ask();
                    }
                });
            };
            ask();
        });
    }
}

// Main program execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    try {
        if (args.length === 0) {
            throw new Error(`No dice configurations provided. Example usage:
  node dicegame.js 2,2,4,4,9,9 1,1,6,6,8,8 3,3,5,5,7,7`);
        }
        
        const game = new DiceGame(args);
        game.play();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = { Dice, FairRandomGenerator, ProbabilityCalculator, DiceGame };