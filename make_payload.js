import fs from 'fs';

const reviewsByMonth = [ { name: 'Apr', Import: 68, Export: 7 } ];
const monthlyDuties = [
  {
    name: 'Apr',
    'IGI Import': 0,
    'IVA Import': 237413,
    'DTA Import': 642879,
    'IGI Export': 0,
    'IVA Export': 11873,
    'DTA Export': 225999
  }
];
const taxSummary = { totalIGI: 0, totalIVA: 249286, totalDTA: 868878 };

const payload = {
    reviewsByMonth,
    monthlyDuties,
    taxSummary
};

fs.writeFileSync('payload.json', JSON.stringify(payload, null, 2));
