const STORAGE_KEY = 'study-mission-assignments';
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

const elements = {
  sidebar: document.querySelector('#sidebar'),
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
  addAssignmentButton: document.querySelector('#addAssignmentButton')
};

function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => typeof value === 'string' && value && !value.includes('YOUR_'));
}

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveAssignments() { localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments)); }
function createId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
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
        setAuthNotice('Signed in. Your assignments are synced to your account.', 'success');
        suppressGenericAuthNotice = false;
      } else {
        assignments = [];
        currentUser = null;
        if (!suppressGenericAuthNotice) {
          setAuthNotice('Sign up or log in to sync assignments to your account.', 'info');
        }
        suppressGenericAuthNotice = false;
      }

      render();
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

initializeFirebase();
render();
renderAuthUi();
