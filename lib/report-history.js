'use strict';
function archiveReports(lead,now=Date.now()){
 const rows=[...(lead?.reports||[])];
 if(lead?.reportHash&&lead.reportExpires>now&&(lead.capabilityCheck||lead.xray))rows.push({reportHash:lead.reportHash,reportExpires:lead.reportExpires,capabilityCheck:lead.capabilityCheck,xray:lead.xray});
 return rows.filter((r,i)=>r.reportExpires>now&&rows.findIndex(x=>x.reportHash===r.reportHash)===i);
}
function findReport(lead,hash,now=Date.now()){
 return [lead,...(lead?.reports||[])].find(r=>r?.reportHash===hash&&r.reportExpires>now);
}
module.exports={archiveReports,findReport};
