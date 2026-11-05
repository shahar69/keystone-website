'use strict';
const stores=new WeakMap();
async function withIdentity(store,key,fn){
 let jobs=stores.get(store);if(!jobs){jobs=new Map();stores.set(store,jobs);}
 const job=(jobs.get(key)||Promise.resolve()).catch(()=>{}).then(fn);jobs.set(key,job);
 try{return await job;}finally{if(jobs.get(key)===job)jobs.delete(key);}
}
module.exports={withIdentity};
