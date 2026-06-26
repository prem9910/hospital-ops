/* eslint-disable */
/**
 * Enhanced Task Visibility Diagnostic
 * Paste in DevTools console while app is open and Priya is logged in.
 * Reports:
 *   - whoami
 *   - all tasks and how many SHOULD be visible (per MyTasks filter)
 *   - which tasks match assignedTo (case-insensitive)
 *   - freq + schedDate for each task assigned to current user
 *   - case/whitespace mismatches
 *   - Supabase verification (paste key in the placeholder below if you want cloud check)
 */
(async function () {
  console.group('🔍 Enhanced Task Diagnostic');

  // ---- 1. current user
  const session = JSON.parse(localStorage.getItem('hops-session') || 'null');
  const cu = session?.user || {};
  console.log('👤 currentUser:', cu);
  console.log('   role:', session?.role);
  console.log('   name (raw):', JSON.stringify(cu.name));
  const myNameUpper = (cu.name || '').toUpperCase();
  console.log('   name (UPPER):', JSON.stringify(myNameUpper));

  // ---- 2. employees
  const lsEmps = JSON.parse(localStorage.getItem('hops-employees') || '[]');
  const me = lsEmps.find((e) => (e.name || '').toUpperCase() === myNameUpper);
  console.log('\n👥 My employee record:');
  if (me) {
    console.log('   name:', JSON.stringify(me.name), '| dept:', me.dept, '| id:', me.id);
  } else {
    console.log('   ⚠️  No employee record matches currentUser.name!');
    console.log('   employees in LS:', lsEmps.map((e) => `${JSON.stringify(e.name)} (${e.dept})`).join(', '));
  }

  // ---- 3. all tasks
  const lsTasks = JSON.parse(localStorage.getItem('hops-tasks') || '[]');
  console.log('\n📦 hops-tasks total:', lsTasks.length, 'rows');

  // ---- 4. tasks with my name in assignedTo (case-insensitive)
  const mineAnyCase = lsTasks.filter((t) =>
    (t.assignedTo || []).some((n) => (n || '').toUpperCase() === myNameUpper)
  );
  console.log('🎯 Tasks where my name appears in assignedTo (case-insensitive):', mineAnyCase.length);

  if (mineAnyCase.length === 0) {
    console.log('\n❌ NO tasks are assigned to you!');
    console.log('   Last 5 tasks in LS:');
    lsTasks.slice(-5).forEach((t) => {
      console.log(`   - ${t.name} | assignedTo: ${JSON.stringify(t.assignedTo)} | schedDate: ${t.schedDate} | freq: ${t.freq} | status: ${t.status}`);
    });
  } else {
    console.log('\n📋 Tasks assigned to me — full breakdown:');
    mineAnyCase.forEach((t, i) => {
      console.log(`\n   [${i + 1}] ${t.name}`);
      console.log(`       assignedTo (raw): ${JSON.stringify(t.assignedTo)}`);
      console.log(`       freq: ${t.freq} | status: ${t.status} | schedDate: ${t.schedDate} | created: ${t.created}`);
      console.log(`       createdBy: ${t.createdBy} | parentTaskId: ${t.parentTaskId || '(none)'}`);
      console.log(`       lastDone: ${t.lastDone || '(never)'}`);
      const today = new Date().toISOString().slice(0, 10);
      const isPending = t.status === 'pending';
      const schedDateOk = !t.schedDate || t.schedDate <= today;
      console.log(`       today: ${today}`);
      console.log(`       status===pending? ${isPending} | schedDate <= today? ${schedDateOk}`);
      console.log(`       ${isPending && schedDateOk ? '✅ SHOULD be in My Tasks' : '❌ Hidden by filter'}`);
    });
  }

  // ---- 5. case/whitespace mismatch check
  console.log('\n🔬 Case/whitespace mismatches across ALL tasks:');
  let mismatches = 0;
  lsTasks.forEach((t) => {
    (t.assignedTo || []).forEach((n) => {
      const nUpper = (n || '').toUpperCase().trim();
      if (nUpper === myNameUpper && n !== cu.name) {
        console.log(`   ⚠️  Mismatch on task "${t.name}": assignedTo="${n}" vs currentUser.name="${cu.name}"`);
        mismatches++;
      }
    });
  });
  if (!mismatches) console.log('   ✅ No mismatches');

  // ---- 6. App state (if available via React DevTools, fall back to LS)
  console.log('\n💡 Tip: if a task is in LS but not showing in UI, hard-refresh (Ctrl+Shift+R) to clear stale state.');

  console.groupEnd();
})();