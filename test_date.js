const d = new Date("1/20/2026");
console.log(d.toISOString());
console.log(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
