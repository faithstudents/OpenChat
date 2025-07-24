import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Supabase configuration
const SUPABASE_URL = 'https://htwevjqqqyojcbgeevqy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2V2anFxcXlvamNiZ2VldnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDg0NzYsImV4cCI6MjA2ODg4NDQ3Nn0.lszlnu4aWcDRAhp_MjJaECRFzGYze_uP7GhfWszA6fY'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const messagesList = document.getElementById('messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const profileNameEl = document.getElementById('profile-username')
const imageInput = document.getElementById('image-input')
const uploadImageBtn = document.getElementById('upload-image-btn')
// const logoutBtn = document.getElementById('logout-btn') // Optional

let user = null
const userCache = new Map()
let lastFetchedTimestamp = null

const usernameCache = new Map() // Caches @username lookups

init()

async function init() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) {
    window.location.href = 'index.html'
    return
  }

  user = session.user
  console.log('Logged in user:', user)

  // Show username in sidebar profile
  await loadProfileUsername(user.id)

  await loadMessages()
  startPollingNewMessages()
}

async function loadProfileUsername(userId) {
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single()

  if (profileError || !profileData?.username) {
    profileNameEl.textContent = user.email.split('@')[0]
  } else {
    profileNameEl.textContent = profileData.username
  }
}

async function loadMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, user_id, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error loading messages:', error.message)
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
  if (!lastFetchedTimestamp) return

  const { data, error } = await supabase
    .from('messages')
    .select('id, content, user_id, created_at')
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

function startPollingNewMessages() {
  setInterval(fetchNewMessages, 3000)
}

async function getUserInfo(userId) {
  if (userCache.has(userId)) return userCache.get(userId)

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single()

  let username
  if (profileError || !profileData?.username) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    if (userError || !userData?.email) {
      username = 'Unknown'
    } else {
      username = userData.email.split('@')[0]
    }
  } else {
    username = profileData.username
  }

  const userInfo = { id: userId, username }
  userCache.set(userId, userInfo)
  return userInfo
}

async function appendMessage(msg) {
  const userInfo = await getUserInfo(msg.user_id)
  const userName = msg.user_id === user.id ? 'You' : userInfo.username

  const li = document.createElement('li')
  li.classList.add('message')
  if (msg.user_id === user.id) li.classList.add('self')

  if (msg.content.startsWith('__img__')) {
    const imageUrl = msg.content.replace('__img__', '')
    li.innerHTML = `<strong>${userName}:</strong><br><img src="${imageUrl}" alt="Image" style="max-width: 300px; border-radius: 8px; margin-top: 5px;" />`
  } else {
    const parsedContent = await parseMentionsAndLinks(msg.content)
    li.innerHTML = `<strong>${userName}:</strong> ${parsedContent}`
  }

  messagesList.appendChild(li)
}

function scrollToBottom() {
  messagesList.scrollTop = messagesList.scrollHeight
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const content = messageInput.value.trim()
  if (!content) return

  const { error } = await supabase.from('messages').insert([
    {
      content,
      user_id: user.id
    }
  ])

  if (error) {
    alert('Failed to send message: ' + error.message)
  } else {
    messageInput.value = ''
    messageInput.focus()
    // message will appear after polling
  }
})

uploadImageBtn.addEventListener('click', () => {
  imageInput.click()
})

imageInput.addEventListener('change', async (event) => {
  const file = event.target.files[0]
  if (!file) return

  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `uploads/${fileName}`

  const { error: uploadError } = await supabase
    .storage
    .from('images')
    .upload(filePath, file)

  if (uploadError) {
    alert('Image upload failed: ' + uploadError.message)
    return
  }

  const { data } = supabase
    .storage
    .from('images')
    .getPublicUrl(filePath)

  const publicUrl = data.publicUrl
  const imageMessage = `__img__${publicUrl}`

  const { error: insertError } = await supabase.from('messages').insert([
    {
      content: imageMessage,
      user_id: user.id
    }
  ])

  if (insertError) {
    alert('Failed to send image: ' + insertError.message)
  }

  imageInput.value = '' // reset file input
})

async function parseMentionsAndLinks(content) {
  const mentionRegex = /@(\w+)/g
  const urlRegex = /https?:\/\/[^\s]+/g

  // Handle @mentions
  const mentionMatches = [...content.matchAll(mentionRegex)]
  for (const match of mentionMatches) {
    const mentionedUsername = match[1]

    if (!usernameCache.has(mentionedUsername)) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', mentionedUsername)
        .single()

      if (!error && data) {
        usernameCache.set(mentionedUsername, data.id)
      }
    }

    if (usernameCache.has(mentionedUsername)) {
      content = content.replaceAll(
        `@${mentionedUsername}`,
        `<span style="color: #007bff; font-weight: bold;">@${mentionedUsername}</span>`
      )
    }
  }

  // Handle links
  content = content.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #00aaff;">${url}</a>`
  })

  return content
}

// OPTIONAL: logout support
// logoutBtn?.addEventListener('click', async () => {
//   await supabase.auth.signOut()
//   window.location.href = 'index.html'
// })
