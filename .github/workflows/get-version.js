let fs = require('fs');
console.log(JSON.parse(fs.readFileSync('./src/lock-the-sheets/module.json', 'utf8')).version);