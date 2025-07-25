import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://htwevjqqqyojcbgeevqy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2V2anFxcXlvamNiZ2VldnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDg0NzYsImV4cCI6MjA2ODg4NDQ3Nn0.lszlnu4aWcDRAhp_MjJaECRFzGYze_uP7GhfWszA6fY'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const userListEl = document.getElementById('user-list')
const messagesList = document.getElementById('messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const backToChatBtn = document.getElementById('back-to-chat')
const logoutBtn = document.getElementById('logout-btn')

let user = null
let selectedUser = null
let lastFetchedTimestamp = null

init()

async function init() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) {
    window.location.href = 'index.html'
    return
  }
  user = session.user

  backToChatBtn.addEventListener('click', () => {
    window.location.href = 'chat.html'
  })

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = 'index.html'
  })

  await loadUsers()
  startPollingMessages()
}

async function loadUsers() {
  // Load all users except current user
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username')
    .neq('id', user.id)

  if (error) {
    alert('Failed to load users: ' + error.message)
    return
  }

  userListEl.innerHTML = ''
  for (const profile of profiles) {
    const li = document.createElement('li')
    li.textContent = profile.username
    li.style.cursor = 'pointer'
    li.style.padding = '0.5rem 0'
    li.addEventListener('click', () => {
      selectUser(profile)
    })
    userListEl.appendChild(li)
  }
}

function selectUser(profile) {
  selectedUser = profile
  lastFetchedTimestamp = null
  messagesList.innerHTML = ''
  loadMessages()
}

async function loadMessages() {
  if (!selectedUser) return

  const { data, error } = await supabase
    .from('messages')
    .select('id, content, user_id, created_at')
    .or(`and(user_id.eq.${user.id},dm_to.eq.${selectedUser.id}),and(user_id.eq.${selectedUser.id},dm_to.eq.${user.id})`)
    .order('created_at', { ascending: true })

  if (error) {
    alert('Failed to load messages: ' + error.message)
    return
  }

  messagesList.innerHTML = ''
  for (const msg of data) {
    await appendMessage(msg)
  }

  if (data.length > 0) {
    lastFetchedTimestamp = data[data.length - 1].created_at
  }

  scrollToBottom()
}

async function fetchNewMessages() {
  if (!selectedUser || !lastFetchedTimestamp) return

  const { data, error } = await supabase
    .from('messages')
    .select('id, content, user_id, created_at')
    .or(`and(user_id.eq.${user.id},dm_to.eq.${selectedUser.id}),and(user_id.eq.${selectedUser.id},dm_to.eq.${user.id})`)
    .gt('created_at', lastFetchedTimestamp)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching new messages:', error.message)
    return
  }

  for (const msg of data) {
    await appendMessage(msg)
    lastFetchedTimestamp = msg.created_at
  }

  scrollToBottom()
}

function startPollingMessages() {
  setInterval(fetchNewMessages, 3000)
}

async function appendMessage(msg) {
  const userName = msg.user_id === user.id ? 'You' : selectedUser.username

  const li = document.createElement('li')
  li.style.padding = '0.5rem 0.75rem'
  li.style.marginBottom = '0.6rem'
  li.style.backgroundColor = msg.user_id === user.id ? '#5865f2' : '#40444b'
  li.style.color = msg.user_id === user.id ? 'white' : '#dcddde'
  li.style.borderRadius = '8px'
  li.style.maxWidth = '75%'
  li.style.wordWrap = 'break-word'
  li.style.fontSize = '0.95rem'
  li.style.lineHeight = '1.3'
  li.style.marginLeft = msg.user_id === user.id ? 'auto' : '0'

  li.innerHTML = `<strong>${userName}:</strong> ${msg.content}`
  messagesList.appendChild(li)
}

function scrollToBottom() {
  messagesList.scrollTop = messagesList.scrollHeight
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!selectedUser) {
    alert('Select a user to chat with')
    return
  }

  const content = messageInput.value.trim()
  if (!content) return

  const { error } = await supabase.from('messages').insert([
    {
      content,
      user_id: user.id,
      dm_to: selectedUser.id
    }
  ])

  if (error) {
    alert('Failed to send message: ' + error.message)
  } else {
    messageInput.value = ''
    messageInput.focus()
  }
})
