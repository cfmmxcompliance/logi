const s = "21/8/2026, 9:17:41";
const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
console.log("Regex match:", mx);
const mx2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}:\d{2}:\d{2})/);
console.log("Fixed Regex match:", mx2);
