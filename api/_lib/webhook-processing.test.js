const test=require('node:test');const assert=require('node:assert/strict');
const statusMap={'subscription.authenticated':'authenticated','subscription.activated':'active','subscription.pending':'pending','subscription.halted':'halted','subscription.cancelled':'cancelled','subscription.paused':'paused','subscription.resumed':'active','subscription.completed':'completed','subscription.expired':'expired'};
test('known Razorpay lifecycle events map to supported local statuses',()=>{for(const [event,status] of Object.entries(statusMap))assert.ok(['authenticated','active','pending','halted','cancelled','paused','completed','expired'].includes(status),event)});
test('unknown event is not mapped into a lifecycle transition',()=>assert.equal(statusMap['subscription.unknown'],undefined));
test('cancelled and completed are terminal local statuses',()=>assert.ok(['cancelled','completed','expired'].every(x=>statusMap['subscription.'+x]===x)));
