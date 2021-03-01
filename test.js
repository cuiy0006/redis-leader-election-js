const redis = require('redis');
const LeaderElection = require('./index.js')
var moment = require('moment')
function now(){
    return moment().format('YYYY-MM-DD hh:mm:ss');
}

let redisClient = redis.createClient(6379, 'localhost');

redisClient.on('ready', () => {
    console.log('ready!!!!!');
});

let le = new LeaderElection(redisClient);

le.on('elected', function() {
    console.log(now(), 'elected');
});

le.on('error', function(functionName, err) {
    console.log(now(), functionName, err);
});

le.on('released', function() {
    console.log(now(), 'released');
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async function() {
    await le.elect();

    cnt = 0;
    while(true){
        amILeader = await le.isLeader();
        if(amILeader){
            console.log(now(), 'doing the task');
            await sleep(10000);
            console.log(now(), 'done the task');
            cnt += 1;
            if(cnt == 5) {
                await le.release();
                console.log('------------------------------');
                await sleep(10000);
                await le.elect();
                cnt = 0;
            }
        }
        await sleep(50000);
    }
})();
