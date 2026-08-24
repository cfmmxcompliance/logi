const s = "21/8/2026, 9:17:41";
const asigLayout = "2026-08-21T16:40:48.103Z";

const parseEsMxUi = (str) => {
  if (!str) return null;
  const mx = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4].padStart(2,'0')}:${mx[5]}:${mx[6]}`);
  const d = new Date(str.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
};

const libDate = parseEsMxUi(s);
console.log("libDate:", libDate);

const lyAt = new Date(asigLayout);
console.log("lyAt:", lyAt);

const mins = Math.round((lyAt.getTime() - libDate.getTime()) / 60000);
console.log("mins T.LAYOUT:", mins);
