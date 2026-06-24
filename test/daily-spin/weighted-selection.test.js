const test = require('node:test');
const assert = require('node:assert');

// The logic extracted from the POST route for testing
function performWeightedSelection(items, randomIntProvider) {
  if (!items || items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const randomVal = randomIntProvider(totalWeight);
  
  let selectedItem = items[0];
  let cumulativeWeight = 0;
  
  for (const item of items) {
    cumulativeWeight += item.weight;
    if (randomVal < cumulativeWeight) {
      selectedItem = item;
      break;
    }
  }
  return selectedItem;
}

test('Weighted Random Selection', async (t) => {
  const sampleItems = [
    { name: 'Common', weight: 70 },
    { name: 'Rare', weight: 20 },
    { name: 'Legendary', weight: 10 }
  ]; // Total weight: 100

  await t.test('Should select Common when random value falls in first bucket', () => {
    // 0-69 should be Common
    const result = performWeightedSelection(sampleItems, (total) => 0); // min
    assert.strictEqual(result.name, 'Common');
    
    const result2 = performWeightedSelection(sampleItems, (total) => 69); // max of bucket
    assert.strictEqual(result2.name, 'Common');
  });

  await t.test('Should select Rare when random value falls in second bucket', () => {
    // 70-89 should be Rare
    const result = performWeightedSelection(sampleItems, (total) => 70);
    assert.strictEqual(result.name, 'Rare');
    
    const result2 = performWeightedSelection(sampleItems, (total) => 89);
    assert.strictEqual(result2.name, 'Rare');
  });

  await t.test('Should select Legendary when random value falls in last bucket', () => {
    // 90-99 should be Legendary
    const result = performWeightedSelection(sampleItems, (total) => 90);
    assert.strictEqual(result.name, 'Legendary');
    
    const result2 = performWeightedSelection(sampleItems, (total) => 99);
    assert.strictEqual(result2.name, 'Legendary');
  });

  await t.test('Should return null for empty items array', () => {
    const result = performWeightedSelection([], (total) => 0);
    assert.strictEqual(result, null);
  });
});
