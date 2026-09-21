const STORAGE_KEY = 'study-mission-assignments';
const GROUP_IDS_KEY = 'study-mission-group-ids';
const firebaseConfig = {
  apiKey: "AIzaSyAti0CbeHd5ClIWRJtuFo7KCnqDPspstCo",
  authDomain: "study-mission-33f4d.firebaseapp.com",
  projectId: "study-mission-33f4d",
  storageBucket: "study-mission-33f4d.firebasestorage.app",
  messagingSenderId: "572551008927",
  appId: "1:572551008927:web:20561b0d2decdfc25008aa"
};

let assignments = [];
let activeFilter = 'all';
let editingId = null;
let currentUser = null;
let firebaseReady = false;
let suppressGenericAuthNotice = false;
let groups = [];
let sharedAssignments = {};
let groupModalMode = 'create';

const elements = {
  sidebar: document.querySelector('#sidebar'),
  sidebarAssignmentCount: document.querySelector('#sidebarAssignmentCount'),
  sidebarGroupCount: document.querySelector('#sidebarGroupCount'),
  dashboardContent: document.querySelector('#dashboardContent'),
  assignmentsContent: document.querySelector('#assignmentsContent'),
  list: document.querySelector('#assignmentList'),
  form: document.querySelector('#assignmentForm'),
  modal: document.querySelector('#modalBackdrop'),
  name: document.querySelector('#assignmentName'),
  subject: document.querySelector('#assignmentSubject'),
  dueDate: document.querySelector('#assignmentDueDate'),
  modalTitle: document.querySelector('#modalTitle'),
  modalEyebrow: document.querySelector('#modalEyebrow'),
  submit: document.querySelector('#submitAssignmentButton'),
  unfinished: document.querySelector('#unfinishedCount'),
  completed: document.querySelector('#completedCount'),
  highPriority: document.querySelector('#highPriorityCount'),
  nextName: document.querySelector('#nextAssignmentName'),
  nextDue: document.querySelector('#nextAssignmentDue'),
  count: document.querySelector('#assignmentCount'),
  authForm: document.querySelector('#authGuest'),
  currentDate: document.querySelector('#currentDate'),
  greetingTime: document.querySelector('#greetingTime'),
  greetingName: document.querySelector('#greetingName'),
  username: document.querySelector('#usernameInput'),
  password: document.querySelector('#passwordInput'),
  authGuest: document.querySelector('#authGuest'),
  authUser: document.querySelector('#authUser'),
  currentUserName: document.querySelector('#currentUserName'),
  authNotice: document.querySelector('#authNotice'),
  signUpButton: document.querySelector('#signUpButton'),
  loginButton: document.querySelector('#loginButton'),
  logoutButton: document.querySelector('#logoutButton'),
  addAssignmentButton: document.querySelector('#addAssignmentButton'),
  groupsContent: document.querySelector('#groupsContent'),
  groupList: document.querySelector('#groupList'),
  createGroupButton: document.querySelector('#createGroupButton'),
  joinGroupButton: document.querySelector('#joinGroupButton'),
  groupModal: document.querySelector('#groupModalBackdrop'),
  closeGroupModalButton: document.querySelector('#closeGroupModalButton'),
  groupForm: document.querySelector('#groupForm'),
  groupModalTitle: document.querySelector('#groupModalTitle'),
  groupNameInput: document.querySelector('#groupNameInput'),
  inviteCodeInput: document.querySelector('#inviteCodeInput'),
  inviteCodeLabel: document.querySelector('#inviteCodeLabel'),
  submitGroupButton: document.querySelector('#submitGroupButton'),
  sharedAssignmentModal: document.querySelector('#sharedAssignmentModalBackdrop'),
  closeSharedAssignmentModalButton: document.querySelector('#closeSharedAssignmentModalButton'),
  sharedAssignmentForm: document.querySelector('#sharedAssignmentForm'),
  sharedAssignmentName: document.querySelector('#sharedAssignmentName'),
  sharedAssignmentSubject: document.querySelector('#sharedAssignmentSubject'),
  sharedAssignmentDueDate: document.querySelector('#sharedAssignmentDueDate'),
  groupNotice: document.querySelector('#groupNotice'),
  groupModalNotice: document.querySelector('#groupModalNotice')
};

function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => typeof value === 'string' && value && !value.includes('YOUR_'));
}

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveAssignments() { localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments)); }
function loadGroupIds() {
  try { return JSON.parse(localStorage.getItem(`${GROUP_IDS_KEY}-${currentUser.uid}`)) || []; }
  catch { return []; }
}
function saveGroupIds() {
  localStorage.setItem(`${GROUP_IDS_KEY}-${currentUser.uid}`, JSON.stringify(groups.map((group) => group.id)));
}
function createId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function formatDate(dateString) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${dateString}T12:00:00`)); }
function isOverdue(assignment) { return !assignment.completed && new Date(`${assignment.dueDate}T23:59:59`) < new Date(); }
function calendarDate(dateString) {
  const date = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
function daysFromNow(dateString) { return Math.round((calendarDate(dateString) - calendarDate()) / 86400000); }
function priorityRank(priority) { return { High: 0, Medium: 1, Low: 2 }[priority] ?? 3; }
function assignmentComparator(a, b) {
  const completionDifference = Number(a.completed) - Number(b.completed);
  if (completionDifference) return completionDifference;
  const dueDateDifference = calendarDate(a.dueDate) - calendarDate(b.dueDate);
  return dueDateDifference || priorityRank(a.priority) - priorityRank(b.priority);
}
function dueCopy(assignment) {
  const days = daysFromNow(assignment.dueDate);
  if (isOverdue(assignment)) return 'Overdue';
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function setAuthNotice(message, type = 'info') {
  if (!elements.authNotice) return;
  elements.authNotice.textContent = message;
  elements.authNotice.dataset.type = type;
}

function setGroupNotice(message, type = 'info') {
  [elements.groupNotice, elements.groupModalNotice].forEach((notice) => {
    if (!notice) return;
    notice.hidden = !message;
    notice.textContent = message || '';
    notice.dataset.type = type;
  });
}

function normalizeUsername(value) {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24);
}

function createInternalFirebaseEmail(username) {
  return `${username}@studymission.invalid`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getCurrentDate() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());
}

function getUserDisplayName(user) {
  return user?.displayName || user?.email?.split('@')[0] || 'User';
}

function groupIsMember(group) {
  return Boolean(currentUser && group.memberIds?.includes(currentUser.uid));
}

function getGroupAssignments(groupId) {
  return sharedAssignments[groupId] || [];
}

function renderAuthUi() {
  const loggedIn = Boolean(currentUser);
  if (elements.authGuest) elements.authGuest.hidden = loggedIn;
  if (elements.authUser) elements.authUser.hidden = !loggedIn;
  if (elements.currentUserName) elements.currentUserName.textContent = loggedIn ? getUserDisplayName(currentUser) : '';
  if (elements.currentDate) elements.currentDate.textContent = getCurrentDate();
  if (elements.greetingTime) elements.greetingTime.textContent = getGreeting();
  if (elements.greetingName) elements.greetingName.textContent = loggedIn ? `${getUserDisplayName(currentUser)}.` : 'scholar.';
  if (elements.sidebar) elements.sidebar.setAttribute('aria-hidden', loggedIn ? 'false' : 'true');
  if (elements.dashboardContent) elements.dashboardContent.hidden = !loggedIn;
  if (elements.assignmentsContent) elements.assignmentsContent.hidden = !loggedIn;
  if (elements.groupsContent) elements.groupsContent.hidden = !loggedIn;
  if (elements.addAssignmentButton) {
    elements.addAssignmentButton.disabled = !loggedIn;
  }
}

async function persistAssignmentsToFirestore() {
  if (!currentUser || !firebaseReady) return;
  const firestore = firebase.firestore();
  const userAssignmentsRef = firestore.collection('users').doc(currentUser.uid).collection('assignments');
  const snapshot = await userAssignmentsRef.get();
  const batch = firestore.batch();
  let hasWrites = false;

  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
    hasWrites = true;
  });

  assignments.forEach((assignment) => {
    batch.set(userAssignmentsRef.doc(assignment.id), {
      ...assignment,
      updatedAt: Date.now()
    });
    hasWrites = true;
  });

  if (hasWrites) {
    await batch.commit();
  }
}

async function loadAssignmentsFromFirestore(user) {
  if (!firebaseReady || !user) {
    assignments = loadAssignments();
    saveAssignments();
    return;
  }

  const firestore = firebase.firestore();
  const snapshot = await firestore.collection('users').doc(user.uid).collection('assignments').get();
  assignments = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  saveAssignments();
  render();
}

async function loadGroupsFromFirestore(user) {
  if (!firebaseReady || !user) {
    groups = [];
    sharedAssignments = {};
    return;
  }

  const firestore = firebase.firestore();
  const groupIds = new Set(loadGroupIds());
  try {
    const groupSnapshot = await firestore.collection('groups').where('memberIds', 'array-contains', user.uid).get();
    groupSnapshot.docs.forEach((doc) => groupIds.add(doc.id));
  } catch {
    // Fall back to direct reads for groups already discovered by this user.
  }
  const groupSnapshots = await Promise.all([...groupIds].map((groupId) => firestore.collection('groups').doc(groupId).get()));
  groups = groupSnapshots
    .filter((doc) => doc.exists && doc.data().memberIds.includes(user.uid))
    .map((doc) => ({ ...doc.data(), id: doc.id, memberNames: {} }));
  saveGroupIds();

  await Promise.all(groups.map(async (group) => {
    try {
      const memberSnapshot = await firestore.collection('groups').doc(group.id).collection('members').get();
      group.memberNames = Object.fromEntries(memberSnapshot.docs.map((member) => [member.id, member.data().userName || 'Member']));
    } catch {
      group.memberNames = {};
    }
  }));
  sharedAssignments = {};

  await Promise.all(groups.map(async (group) => {
    try {
      const assignmentSnapshot = await firestore.collection('groups').doc(group.id).collection('assignments').get();
      sharedAssignments[group.id] = await Promise.all(assignmentSnapshot.docs.map(async (doc) => {
        try {
          const completionSnapshot = await doc.ref.collection('completions').get();
          const ownCompletion = completionSnapshot.docs.find((completion) => completion.id === user.uid);
          const completedByNames = completionSnapshot.docs
            .filter((completion) => completion.data().completed === true)
            .map((completion) => completion.data().userName || 'Member');
          return { ...doc.data(), id: doc.id, completed: ownCompletion?.data().completed === true, completedCount: completedByNames.length, completedByNames };
        } catch {
          return { ...doc.data(), id: doc.id, completed: false, completedCount: 0, completedByNames: [] };
        }
      }));
    } catch {
      sharedAssignments[group.id] = [];
    }
  }));
}

function openGroupModal(mode) {
  groupModalMode = mode;
  elements.groupModal.hidden = false;
  elements.groupForm.reset();
  const joining = mode === 'join';
  elements.groupModalTitle.textContent = joining ? 'Join group' : 'Create group';
  elements.groupNameInput.hidden = joining;
  elements.groupNameInput.required = !joining;
  elements.inviteCodeInput.hidden = !joining;
  elements.inviteCodeInput.required = joining;
  elements.inviteCodeLabel.hidden = !joining;
  elements.submitGroupButton.textContent = joining ? 'Join group' : 'Create group';
  setGroupNotice('');
  (joining ? elements.inviteCodeInput : elements.groupNameInput).focus();
}

function closeGroupModal() {
  elements.groupModal.hidden = true;
}

function openSharedAssignmentModal(groupId) {
  elements.sharedAssignmentModal.dataset.groupId = groupId;
  elements.sharedAssignmentModal.hidden = false;
  elements.sharedAssignmentForm.reset();
  elements.sharedAssignmentDueDate.value = new Date().toISOString().slice(0, 10);
  elements.sharedAssignmentName.focus();
}

function closeSharedAssignmentModal() {
  elements.sharedAssignmentModal.hidden = true;
}

async function createGroup(name) {
  const firestore = firebase.firestore();
  const groupRef = firestore.collection('groups').doc();
  const inviteCode = createInviteCode();
  await groupRef.set({
    name,
    inviteCode,
    createdBy: currentUser.uid,
    memberIds: [currentUser.uid],
    createdAt: Date.now()
  });
  await firestore.collection('inviteCodes').doc(inviteCode).set({ groupId: groupRef.id });
  await groupRef.collection('members').doc(currentUser.uid).set({
    userId: currentUser.uid,
    userName: getUserDisplayName(currentUser),
    joinedAt: Date.now()
  });
  return {
    id: groupRef.id,
    name,
    inviteCode,
    createdBy: currentUser.uid,
    memberIds: [currentUser.uid],
    createdAt: Date.now()
  };
}

async function joinGroup(inviteCode) {
  const firestore = firebase.firestore();
  const inviteSnapshot = await firestore.collection('inviteCodes').doc(inviteCode.toUpperCase()).get();
  if (!inviteSnapshot.exists) throw new Error('Invite code not found.');
  const groupId = inviteSnapshot.data().groupId;
  const groupRef = firestore.collection('groups').doc(groupId);
  await groupRef.update({ memberIds: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
  await groupRef.collection('members').doc(currentUser.uid).set({
    userId: currentUser.uid,
    userName: getUserDisplayName(currentUser),
    joinedAt: Date.now()
  });
  const groupSnapshot = await groupRef.get();
  if (!groupSnapshot.exists) throw new Error('This group no longer exists.');
  return {
    id: groupId,
    ...groupSnapshot.data(),
    memberIds: [...groupSnapshot.data().memberIds, currentUser.uid]
  };
}

async function handleGroupSubmit(event) {
  event.preventDefault();
  try {
    if (groupModalMode === 'join') {
      const inviteCode = elements.inviteCodeInput.value.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (inviteCode.length !== 6) throw new Error('Enter a 6-character invite code.');
      const joinedGroup = await joinGroup(inviteCode);
      groups = [joinedGroup, ...groups.filter((group) => group.id !== joinedGroup.id)];
      sharedAssignments[joinedGroup.id] = [];
      saveGroupIds();
    } else {
      const groupName = elements.groupNameInput.value.trim();
      if (!groupName) throw new Error('Enter a group name.');
      const createdGroup = await createGroup(groupName);
      groups = [createdGroup, ...groups.filter((group) => group.id !== createdGroup.id)];
      sharedAssignments[createdGroup.id] = [];
      saveGroupIds();
    }
    closeGroupModal();
    renderGroups();
    setGroupNotice(groupModalMode === 'join' ? 'You joined the study group.' : 'Study group created.', 'success');
  } catch (error) {
    setGroupNotice(error.message || 'Could not update the study group.', 'error');
  }
}

async function handleSharedAssignmentSubmit(event) {
  event.preventDefault();
  const groupId = elements.sharedAssignmentModal.dataset.groupId;
  const formData = new FormData(elements.sharedAssignmentForm);
  const assignment = {
    name: formData.get('name').trim(),
    subject: formData.get('subject'),
    dueDate: formData.get('dueDate'),
    priority: formData.get('priority'),
    addedBy: currentUser.uid,
    addedByName: getUserDisplayName(currentUser),
    createdAt: Date.now()
  };
  try {
    const assignmentRef = firebase.firestore().collection('groups').doc(groupId).collection('assignments').doc();
    await assignmentRef.set(assignment);
    sharedAssignments[groupId] = [
      { ...assignment, id: assignmentRef.id, completed: false, completedCount: 0, completedByNames: [] },
      ...getGroupAssignments(groupId)
    ];
    closeSharedAssignmentModal();
    renderGroups();
    setGroupNotice('Shared assignment added.', 'success');
  } catch (error) {
    setGroupNotice(error.message || 'Could not add the shared assignment.', 'error');
  }
}

async function toggleSharedCompletion(groupId, assignment) {
  const completionRef = firebase.firestore().collection('groups').doc(groupId).collection('assignments').doc(assignment.id).collection('completions').doc(currentUser.uid);
  const completed = !assignment.completed;
  await completionRef.set({ completed, userName: getUserDisplayName(currentUser), updatedAt: Date.now() });
  assignment.completed = !assignment.completed;
  assignment.completedCount += completed ? 1 : -1;
  assignment.completedByNames = completed
    ? [...assignment.completedByNames, getUserDisplayName(currentUser)]
    : assignment.completedByNames.filter((name) => name !== getUserDisplayName(currentUser));
  renderGroups();
}

async function deleteGroupData(group) {
  const firestore = firebase.firestore();
  const groupRef = firestore.collection('groups').doc(group.id);
  const assignmentSnapshot = await groupRef.collection('assignments').get();

  for (const assignmentDoc of assignmentSnapshot.docs) {
    const completionSnapshot = await assignmentDoc.ref.collection('completions').get();
    for (const completionDoc of completionSnapshot.docs) await completionDoc.ref.delete();
    await assignmentDoc.ref.delete();
  }

  const memberSnapshot = await groupRef.collection('members').get();
  for (const memberDoc of memberSnapshot.docs) await memberDoc.ref.delete();
  await firestore.collection('inviteCodes').doc(group.inviteCode).delete();
  await groupRef.delete();
}

async function deleteGroup(group) {
  if (group.createdBy !== currentUser.uid) return;
  if (!window.confirm(`Delete "${group.name}" and all of its shared assignments?`)) return;
  try {
    await deleteGroupData(group);
    groups = groups.filter((item) => item.id !== group.id);
    delete sharedAssignments[group.id];
    renderGroups();
    setGroupNotice('Study group deleted.', 'success');
  } catch (error) {
    setGroupNotice(error.message || 'Could not delete the study group.', 'error');
  }
}

async function leaveGroup(group) {
  if (group.createdBy === currentUser.uid) return;
  if (!window.confirm(`Leave "${group.name}"?`)) return;
  try {
    const firestore = firebase.firestore();
    const groupRef = firestore.collection('groups').doc(group.id);
    await groupRef.update({ memberIds: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    await groupRef.collection('members').doc(currentUser.uid).delete();
    groups = groups.filter((item) => item.id !== group.id);
    delete sharedAssignments[group.id];
    renderGroups();
    setGroupNotice('You left the study group.', 'success');
  } catch (error) {
    setGroupNotice(error.message || 'Could not leave the study group.', 'error');
  }
}

async function copyInviteCode(group) {
  try {
    await navigator.clipboard.writeText(group.inviteCode);
    setGroupNotice('Invite code copied.', 'success');
  } catch {
    setGroupNotice(`Invite code: ${group.inviteCode}`, 'info');
  }
}

function renderGroups() {
  if (!elements.groupList) return;
  if (elements.sidebarGroupCount) elements.sidebarGroupCount.textContent = groups.length;
  if (!groups.length) {
    elements.groupList.innerHTML = '<div class="empty-state"><strong>No study groups yet</strong><p>Create a group or join one with an invite code.</p></div>';
    return;
  }
  elements.groupList.innerHTML = groups.map((group) => {
    const assignmentsForGroup = [...getGroupAssignments(group.id)].sort(assignmentComparator);
    const completedCount = assignmentsForGroup.reduce((total, assignment) => total + assignment.completedCount, 0);
    const totalCompletionSlots = assignmentsForGroup.length * group.memberIds.length;
    const assignmentMarkup = assignmentsForGroup.length ? assignmentsForGroup.map((assignment) => `
      <div class="shared-assignment-row ${assignment.completed ? 'done' : ''}">
        <button class="check-button" data-group-action="complete" data-group-id="${group.id}" data-assignment-id="${assignment.id}" type="button" aria-label="${assignment.completed ? 'Mark incomplete' : 'Mark complete'} ${escapeHtml(assignment.name)}">${assignment.completed ? '✓' : ''}</button>
        <div class="assignment-details"><span class="assignment-name">${escapeHtml(assignment.name)}</span><span class="assignment-subject">${escapeHtml(assignment.subject)} · added by ${escapeHtml(assignment.addedByName || 'member')}</span><span class="shared-completed-by">${assignment.completedByNames.length ? `Completed by ${assignment.completedByNames.map(escapeHtml).join(', ')}` : 'Not completed yet'}</span></div>
        <span class="due-date ${isOverdue(assignment) ? 'overdue' : ''}">${dueCopy(assignment)}</span>
        <span class="priority-badge ${assignment.priority}">${assignment.priority}</span>
        <span class="shared-added-by">${formatDate(assignment.dueDate)}</span>
      </div>`).join('') : '<div class="group-empty"><strong>No shared assignments</strong><br>Add the first one for this group.</div>';
    const memberNames = group.memberIds.map((memberId) => group.memberNames?.[memberId] || (memberId === currentUser.uid ? getUserDisplayName(currentUser) : 'Member'));
    const deleteAction = group.createdBy === currentUser.uid
      ? '<button class="group-delete-button" data-group-action="delete" data-group-id="' + group.id + '" type="button" aria-label="Delete group" title="Delete group">🗑</button>'
      : '';
    const managementAction = group.createdBy === currentUser.uid
      ? ''
      : '<button class="button button-secondary" data-group-action="leave" data-group-id="' + group.id + '" type="button">Leave group</button>';
    return `<article class="group-card"><div class="group-card-heading"><div><h3>${escapeHtml(group.name)}</h3><p class="group-meta">${group.memberIds.length} members · ${completedCount} / ${totalCompletionSlots} completed</p><p class="group-members"><strong>Members:</strong> ${memberNames.map(escapeHtml).join(', ')}</p></div><div class="group-header-actions"><span class="group-code">CODE ${escapeHtml(group.inviteCode)} <button class="copy-code-button" data-group-action="copy" data-group-id="${group.id}" type="button" aria-label="Copy invite code" title="Copy invite code">⧉</button></span>${deleteAction}</div></div><div class="group-card-actions"><button class="button button-secondary" data-group-action="add" data-group-id="${group.id}" type="button">Add shared assignment</button>${managementAction}</div><div class="shared-assignment-list">${assignmentMarkup}</div></article>`;
  }).join('');
}

async function handleAuthSubmit(mode) {
  if (!firebaseReady) {
    setAuthNotice('Still connecting to Firebase. Please try again in a moment.', 'error');
    return;
  }

  const username = normalizeUsername(elements.username?.value || '');
  const password = elements.password?.value || '';

  if (!username || !password) {
    suppressGenericAuthNotice = true;
    setAuthNotice('Enter a username and password to continue.', 'error');
    return;
  }

  if (!/^[a-z0-9_-]+$/.test(username)) {
    suppressGenericAuthNotice = true;
    setAuthNotice('Username can only contain letters, numbers, hyphens and underscores.', 'error');
    return;
  }

  if (password.length < 6) {
    suppressGenericAuthNotice = true;
    setAuthNotice('Password too short. Use at least 6 characters.', 'error');
    return;
  }

  const internalEmail = createInternalFirebaseEmail(username);

  try {
    suppressGenericAuthNotice = true;
    setAuthNotice(mode === 'signup' ? 'Creating your account...' : 'Logging you in...', 'info');
    const auth = firebase.auth();
    if (mode === 'signup') {
      const userCredential = await auth.createUserWithEmailAndPassword(internalEmail, password);
      await userCredential.user.updateProfile({ displayName: username });
      currentUser = userCredential.user;
      renderAuthUi();
      setAuthNotice('Sign up successful. Your account is ready.', 'success');
    } else {
      const userCredential = await auth.signInWithEmailAndPassword(internalEmail, password);
      await userCredential.user.updateProfile({ displayName: username });
      currentUser = userCredential.user;
      renderAuthUi();
      setAuthNotice('Log in successful.', 'success');
    }

    if (elements.username) elements.username.value = '';
    if (elements.password) elements.password.value = '';
  } catch (error) {
    suppressGenericAuthNotice = true;
    const message = (error && error.message) || 'Could not connect.';
    const normalized = message.toLowerCase();
    let friendly = 'Could not connect.';
    if (normalized.includes('email already in use') || normalized.includes('already exists')) friendly = 'Username already exists.';
    else if (normalized.includes('user-not-found') || normalized.includes('wrong-password') || normalized.includes('invalid-password') || normalized.includes('invalid-credential') || normalized.includes('invalid login credentials')) friendly = 'Wrong username or password.';
    else if (normalized.includes('password') && normalized.includes('short')) friendly = 'Password too short.';
    setAuthNotice(friendly, 'error');
  }
}

async function handleLogout() {
  if (!firebaseReady) return;
  await firebase.auth().signOut();
  setAuthNotice('Signed out. Local data is still available while signed out.', 'info');
  assignments = loadAssignments();
  render();
}

function initializeFirebase() {
  if (!isFirebaseConfigured()) {
    setAuthNotice('Could not connect. Please check your Firebase config.', 'error');
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    firebaseReady = true;

    const auth = firebase.auth();
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      renderAuthUi();

      if (user) {
        await loadAssignmentsFromFirestore(user);
        try { await loadGroupsFromFirestore(user); }
        catch { groups = []; sharedAssignments = {}; }
        setAuthNotice('Signed in. Your assignments are synced to your account.', 'success');
        suppressGenericAuthNotice = false;
      } else {
        assignments = [];
        groups = [];
        sharedAssignments = {};
        currentUser = null;
        if (!suppressGenericAuthNotice) {
          setAuthNotice('Sign up or log in to sync assignments to your account.', 'info');
        }
        suppressGenericAuthNotice = false;
      }

      render();
      renderGroups();
    });
  } catch (error) {
    firebaseReady = false;
    setAuthNotice('Firebase could not start. Refresh the page and try again.', 'error');
  }
}

function render() {
  if (!currentUser) {
    elements.unfinished.textContent = '0';
    elements.completed.textContent = '0';
    elements.highPriority.textContent = '0';
    elements.count.textContent = '0';
    elements.nextName.textContent = 'Please sign in';
    elements.nextDue.textContent = 'Your assignments will appear after login';
    elements.list.innerHTML = '<div class="empty-state"><strong>Please sign in</strong><p>Your personal assignments will appear here after you log in.</p></div>';
    if (elements.sidebarAssignmentCount) elements.sidebarAssignmentCount.textContent = '0';
    if (elements.sidebarGroupCount) elements.sidebarGroupCount.textContent = '0';
    return;
  }

  const unfinished = assignments.filter((assignment) => !assignment.completed);
  const visible = assignments.filter((assignment) => activeFilter === 'all' || (activeFilter === 'active' && !assignment.completed) || (activeFilter === 'completed' && assignment.completed)).sort(assignmentComparator);
  const next = [...unfinished].sort(assignmentComparator)[0];

  elements.unfinished.textContent = unfinished.length;
  elements.completed.textContent = assignments.filter((assignment) => assignment.completed).length;
  elements.highPriority.textContent = unfinished.filter((assignment) => assignment.priority === 'High').length;
  elements.count.textContent = visible.length;
  elements.nextName.textContent = next ? next.name : 'No upcoming work';
  elements.nextDue.textContent = next ? `${next.subject} · ${dueCopy(next)}` : 'Add an assignment to get started';
  if (elements.sidebarAssignmentCount) elements.sidebarAssignmentCount.textContent = unfinished.length;
  if (elements.sidebarGroupCount) elements.sidebarGroupCount.textContent = groups.length;

  if (!visible.length) {
    elements.list.innerHTML = `<div class="empty-state"><strong>${activeFilter === 'completed' ? 'Nothing completed yet' : 'Your plate is clear'}</strong><p>${activeFilter === 'completed' ? 'Completed assignments will appear here.' : 'Add your next assignment and make a plan.'}</p></div>`;
    return;
  }
  elements.list.innerHTML = visible.map((assignment, index) => `
    <article class="assignment-row ${assignment.completed ? 'done' : ''}" style="animation-delay:${index * 35}ms">
      <button class="check-button" data-action="complete" data-id="${assignment.id}" type="button" aria-label="${assignment.completed ? 'Mark incomplete' : 'Mark complete'} ${escapeHtml(assignment.name)}">${assignment.completed ? '✓' : ''}</button>
      <div class="assignment-details"><span class="assignment-name">${escapeHtml(assignment.name)}</span><span class="assignment-subject">${escapeHtml(assignment.subject)}</span></div>
      <span class="due-date ${isOverdue(assignment) ? 'overdue' : ''}">${assignment.completed ? formatDate(assignment.dueDate) : dueCopy(assignment)}</span>
      <span class="priority-badge ${assignment.priority}">${assignment.priority}</span>
      <span class="due-date desktop-date">${formatDate(assignment.dueDate)}</span>
      <div class="row-actions"><button class="icon-button" data-action="edit" data-id="${assignment.id}" type="button" aria-label="Edit ${escapeHtml(assignment.name)}">✎</button><button class="icon-button" data-action="delete" data-id="${assignment.id}" type="button" aria-label="Delete ${escapeHtml(assignment.name)}">⌫</button></div>
    </article>`).join('');
}

function escapeHtml(value) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }
function openModal(assignment) {
  editingId = assignment?.id || null;
  elements.modal.hidden = false;
  elements.modalTitle.textContent = assignment ? 'Edit assignment' : 'Add assignment';
  elements.modalEyebrow.textContent = assignment ? 'Update mission' : 'New mission';
  elements.submit.innerHTML = `${assignment ? 'Save changes' : 'Add assignment'} <span aria-hidden="true">→</span>`;
  elements.form.reset();
  if (assignment) {
    elements.name.value = assignment.name; elements.subject.value = assignment.subject; elements.dueDate.value = assignment.dueDate;
    document.querySelector(`input[name="priority"][value="${assignment.priority}"]`).checked = true;
  } else { elements.dueDate.value = new Date().toISOString().slice(0, 10); }
  elements.name.focus();
}
function closeModal() { elements.modal.hidden = true; editingId = null; }

if (elements.addAssignmentButton) elements.addAssignmentButton.addEventListener('click', () => openModal());
if (document.querySelector('#closeModalButton')) document.querySelector('#closeModalButton').addEventListener('click', closeModal);
if (elements.modal) elements.modal.addEventListener('click', (event) => { if (event.target === elements.modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.modal.hidden) closeModal(); });
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const data = { name: formData.get('name').trim(), subject: formData.get('subject'), dueDate: formData.get('dueDate'), priority: formData.get('priority') };
  if (editingId) assignments = assignments.map((assignment) => assignment.id === editingId ? { ...assignment, ...data } : assignment);
  else assignments.push({ id: createId(), ...data, completed: false });
  saveAssignments();
  render();
  closeModal();
  await persistAssignmentsToFirestore();
});

document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter-button').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));

elements.list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  const assignment = assignments.find((item) => item.id === id);
  if (!assignment) return;
  if (action === 'complete') assignment.completed = !assignment.completed;
  if (action === 'delete') assignments = assignments.filter((item) => item.id !== id);
  if (action === 'edit') return openModal(assignment);
  saveAssignments();
  render();
  await persistAssignmentsToFirestore();
});

if (elements.createGroupButton) elements.createGroupButton.addEventListener('click', () => openGroupModal('create'));
if (elements.joinGroupButton) elements.joinGroupButton.addEventListener('click', () => openGroupModal('join'));
if (elements.closeGroupModalButton) elements.closeGroupModalButton.addEventListener('click', closeGroupModal);
if (elements.groupModal) elements.groupModal.addEventListener('click', (event) => { if (event.target === elements.groupModal) closeGroupModal(); });
if (elements.groupForm) elements.groupForm.addEventListener('submit', handleGroupSubmit);
if (elements.closeSharedAssignmentModalButton) elements.closeSharedAssignmentModalButton.addEventListener('click', closeSharedAssignmentModal);
if (elements.sharedAssignmentModal) elements.sharedAssignmentModal.addEventListener('click', (event) => { if (event.target === elements.sharedAssignmentModal) closeSharedAssignmentModal(); });
if (elements.sharedAssignmentForm) elements.sharedAssignmentForm.addEventListener('submit', handleSharedAssignmentSubmit);
if (elements.groupList) elements.groupList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-group-action]');
  if (!button) return;
  const groupId = button.dataset.groupId;
  const group = groups.find((item) => item.id === groupId);
  if (!group) return;
  if (button.dataset.groupAction === 'copy') return copyInviteCode(group);
  if (button.dataset.groupAction === 'delete') return deleteGroup(group);
  if (button.dataset.groupAction === 'leave') return leaveGroup(group);
  if (button.dataset.groupAction === 'add') return openSharedAssignmentModal(groupId);
  if (button.dataset.groupAction === 'complete') {
    const assignment = getGroupAssignments(groupId).find((item) => item.id === button.dataset.assignmentId);
    if (!assignment) return;
    try {
      await toggleSharedCompletion(groupId, assignment);
    } catch (error) {
      setAuthNotice(error.message || 'Could not update completion.', 'error');
    }
  }
});

if (elements.authForm) elements.authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const mode = event.submitter?.dataset.authMode || 'login';
  handleAuthSubmit(mode);
});
if (elements.logoutButton) elements.logoutButton.addEventListener('click', handleLogout);

if (elements.currentUserName) elements.currentUserName.textContent = '';
if (elements.authNotice) elements.authNotice.textContent = 'Sign up or log in to sync assignments to your account.';
if (elements.authNotice) elements.authNotice.dataset.type = 'info';
if (elements.sidebar) elements.sidebar.setAttribute('aria-hidden', 'true');
if (elements.dashboardContent) elements.dashboardContent.hidden = true;
if (elements.assignmentsContent) elements.assignmentsContent.hidden = true;
if (elements.groupsContent) elements.groupsContent.hidden = true;

initializeFirebase();
render();
renderAuthUi();
