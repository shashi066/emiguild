(async () => {
  try {
    const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    console.log('Fetching active draws from', base + '/api/draws?activeOnly=true');

    const drawsRes = await fetch(base + '/api/draws?activeOnly=true');
    const draws = await drawsRes.json();
    console.log('draws:', JSON.stringify(draws, null, 2));

    if (draws?.draws?.length) {
      const id = draws.draws[0].id;
      console.log('\nFetching participants for draw id:', id);
      const participantsRes = await fetch(base + `/api/draws/${id}/entries`);
      const participants = await participantsRes.json();
      console.log('participants:', JSON.stringify(participants, null, 2));
    } else {
      console.log('No active draws found.');
    }
  } catch (err) {
    console.error('Error in check:', err);
    process.exitCode = 1;
  }
})();
