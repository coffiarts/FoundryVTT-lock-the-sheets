let fs = require('fs');
console.log(JSON.parse(fs.readFileSync('./src/actor-sheet-locker/module.json', 'utf8')).version);