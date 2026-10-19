export function chinaDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function shiftDate(date, delta) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0,10);
}
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= '2100-12-31' && !isNaN(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date;
}
export function streak(dates, today) {
  const set = new Set(dates.filter(d => d <= today)); let cursor = set.has(today) ? today : shiftDate(today,-1), count = 0;
  while(set.has(cursor)) { count++; cursor = shiftDate(cursor,-1); } return count;
}
export function weekStart(date) {
 const offset=(new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7;
 return shiftDate(date,-offset);
}
export function longestStreak(dates) {
 let longest=0,run=0,previous=null;
 for(const date of [...new Set(dates)].sort()){run=previous&&shiftDate(previous,1)===date?run+1:1;longest=Math.max(longest,run);previous=date;}
 return longest;
}
