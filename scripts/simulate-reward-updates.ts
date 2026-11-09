// Economy illustration only: no database, live configuration or reward writes.
const tiers = [15, 30, 60, 120, 600];
console.log('Expedition: exact probability of reaching the target before red, ignoring the 90-second timer.');
console.log('| Collect target | Success | Minutes / 1,000 accounts: free only | Free + daily bonus | Three-run carryover day |');
console.log('|---|---:|---:|---:|---:|');
let probability = 1;
for (let green = 1; green <= 5; green++) {
  probability *= (6 - green) / (11 - green);
  const value = probability * tiers[green - 1] * 1000;
  console.log(`| ${green === 5 ? 'Bronze · 10h face value' : `${tiers[green - 1]}m`} | ${(probability * 100).toFixed(4)}% | ${value.toFixed(1)} | ${(value * 2).toFixed(1)} | ${(value * 3).toFixed(1)} |`);
}
console.log('Bronze: 3.968 passes / 1,000 runs; 7.937 with two runs/account; 11.905 on a three-run carryover day.');
console.log('Two runs/day is the sustained grant rate. Three is a carryover burst, not three new daily grants. Timer/network delays reduce these no-timer figures.');
console.log('\nSpin: 90 consecutive days with a selected ordinary rarity; both pools configured, one item per rarity.');
console.log('| Selected ordinary rarity | Ordinary selected | Guaranteed Epic | Guaranteed Legendary | Total Epic | Total Legendary |');
console.log('|---|---:|---:|---:|---:|---:|');
for (const selected of ['COMMON', 'EPIC', 'LEGENDARY']) {
  let epicProgress = 0, legendaryProgress = 0, ordinary = 0, epicGuarantees = 0, legendaryGuarantees = 0, epics = 0, legendaries = 0;
  for (let day = 0; day < 90; day++) {
    const legendary = legendaryProgress >= 29, epic = !legendary && epicProgress >= 9;
    const rarity = legendary ? 'LEGENDARY' : epic ? 'EPIC' : selected;
    if (legendary) legendaryGuarantees++; else if (epic) epicGuarantees++; else ordinary++;
    if (rarity === 'LEGENDARY') legendaries++;
    if (rarity === 'EPIC') epics++;
    legendaryProgress = rarity === 'LEGENDARY' ? 0 : legendaryProgress + 1;
    epicProgress = rarity === 'EPIC' || rarity === 'LEGENDARY' ? 0 : epicProgress + 1;
  }
  console.log(`| ${selected} | ${ordinary} | ${epicGuarantees} | ${legendaryGuarantees} | ${epics} | ${legendaries} |`);
}
console.log('A selected high-tier item materially increases issuance. These scenarios do not predict the venue’s actual reward costs or modify approved rules.');
