const s = "21/8/2026, 9:17:41";
const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/);
if (mx) {
  const dStr = `${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4].padStart(2,'0')}:${mx[5]}:${mx[6]}`;
  console.log("String for new Date:", dStr);
  const d = new Date(dStr);
  console.log("Date object:", d);
}
