let fs = require('fs');
console.log(JSON.parse(fs.readFileSync('./src/shake-them-all/module.json', 'utf8')).version);