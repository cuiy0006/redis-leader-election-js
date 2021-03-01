'use strict'

const uuid = require('uuid');
const EventEmitter = require('events').EventEmitter;
const crypto = require('crypto');

class LeaderElection extends EventEmitter {
    constructor(redisClient,
                leaseTimeout=10000,
                acquireLockInterval=1000,
                lockKey='FillYourServiceName') {
        super();
        this.id  = uuid.v4();
        this.redisClient = redisClient;
        this.leaseTimeout = leaseTimeout;
        this.acquireLockInterval = acquireLockInterval;
        this.lockKey = crypto.createHash('sha1').update(lockKey).digest('hex');
        this.released = true;
    }

    async isLeader() {
        return new Promise(function(resolve, _) {
            this.redisClient.get(this.lockKey, function(err, res) {
                if(err){
                    this.emit('error', 'isLeader', err);
                    resolve(false);
                }
                
                if(res == this.id){
                    resolve(true);
                } else {
                    resolve(false);
                }
                
            }.bind(this));
        }.bind(this));
    }

    async release() {
        return new Promise(async function(resolve, _){
            if(this.renewTimer) {
                clearInterval(this.renewTimer);
            }
            if(this.electTimer){
                clearTimeout(this.electTimer);
            }

            this.released = true;
            this.emit('released');

            const iAmLeader = await this.isLeader();
            if(iAmLeader){
                this.redisClient.del(this.lockKey, function(err, _){
                    if(err) {
                        this.emit('error', 'release', err);
                    }
                    resolve();
                }.bind(this));
            } else {
                resolve();
            }
        }.bind(this));
    }

    async _renew() {
        const iAmLeader = await this.isLeader();
        if(iAmLeader) {
            this.redisClient.pexpire(this.lockKey, this.leaseTimeout, async function(err, res) {
                if(err) {
                    this.emit('error', '_renew', err);
                }

                if(res == 0) {
                    this.emit('error', '_renew', new Error('lock key does not exist when renew'));
                }

                if(res != 1) {
                    await this.release();
                    await this.elect();
                }

            }.bind(this));

        } else {
            await this.release();
            await this.elect();
        }
    }

    async elect() {
        if(!this.released) {
            err = new Error('duplicated calls to elect before release')
            this.emit('error', 'elect', err);
            throw err;
        }

        return new Promise(function(resolve, reject) {
            this.redisClient.set(this.lockKey, this.id, 'PX', this.leaseTimeout, 'NX', function(err, res) {
                if(err) {
                    this.emit('error', 'elect', err);
                    reject(err);
                }

                if(res !== null) {
                    this.emit('elected');
                    this.released = false;
                    this.renewTimer = setInterval(this._renew.bind(this), this.leaseTimeout / 2);
                } else {
                    this.electTimer = setTimeout(this.elect.bind(this), this.acquireLockInterval);
                }
                resolve();

            }.bind(this));
        }.bind(this));
    }
}

module.exports = LeaderElection;