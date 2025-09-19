import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://htwevjqqqyojcbgeevqy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2V2anFxcXlvamNiZ2VldnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDg0NzYsImV4cCI6MjA2ODg4NDQ3Nn0.lszlnu4aWcDRAhp_MjJaECRFzGYze_uP7GhfWszA6fY'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const userListEl = document.getElementById('user-list')
const messagesList = document.getElementById('dms-messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const backToChatBtn = document.getElementById('back-to-chat')
const logoutBtn = document.getElementById('logout-btn')

const profileModal = document.getElementById('profile-modal')
const profileForm = document.getElementById('profile-form')
const displayNameInput = document.getElementById('display-name-input')
const closeModalBtn = document.getElementById('close-modal-btn')
const profileInfo = document.querySelector('.profile-info')

const profileUsername = document.getElementById("profile-username")

let user = null
let selectedUser = null
let messageSubscription = null
let oldestTimestamp = null
let loadingOlderMessages = false

const MESSAGE_LIMIT = 30

init()

async function init() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) {
        window.location.href = '../index.html'
        return
    }
    user = session.user

    // Fetch the username from profiles table
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        profileUsername.textContent = 'Unknown user'
    } else {
        profileUsername.textContent = profile.username
    }

    messageInput.placeholder = "Select a user to chat with."

    // Setup modal open/close
    profileInfo.addEventListener('click', () => {
        displayNameInput.value = ''  // clear previous input
        displayNameInput.placeholder = profileUsername.textContent
        profileModal.style.display = 'flex'
        displayNameInput.focus()
    })

    closeModalBtn.addEventListener('click', () => {
        profileModal.style.display = 'none'
    })

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const newName = displayNameInput.value.trim()
        if (!newName) return alert('Display name cannot be empty')

        // Update username in Supabase profiles table
        const { error } = await supabase
            .from('profiles')
            .update({ username: newName })
            .eq('id', user.id)

        if (error) {
            alert('Failed to update name: ' + error.message)
            return
        }

        // Update UI
        profileUsername.textContent = newName
        profileModal.style.display = 'none'
    })

    await supabase.realtime.connect()

    backToChatBtn.addEventListener('click', () => window.location.href = 'chat.html')
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut()
        window.location.href = 'index.html'
    })

    messagesList.addEventListener('scroll', loadOlderMessagesOnScroll)
    await loadUsers()
}

function parseLinks(text) {
    const urlRegex = /((https?:\/\/)?([\w\-]+\.)+[a-z]{2,}(\/[\w\-./?%&=]*)?)/gi
    return text.replace(urlRegex, (match) => {
        let url = match.startsWith('http') ? match : `https://${match}`
        return `<a href="${url}" target="_blank" style="color: #00aff4; text-decoration: underline;">${match}</a>`
    })
}

async function loadUsers() {
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username')
        .neq('id', user.id)

    if (error) return alert('Failed to load users: ' + error.message)

    userListEl.innerHTML = ''
    profiles.forEach(profile => {
        const li = document.createElement('li')
        li.textContent = profile.username
        li.style.cursor = 'pointer'
        li.style.padding = '0.5rem 0'
        li.addEventListener('click', () => selectUser(profile))
        userListEl.appendChild(li)
    })
}

function selectUser(profile) {
    selectedUser = profile
    messagesList.innerHTML = ''
    oldestTimestamp = null
    removeSubscription()
    loadInitialMessages()
    subscribeToMessages()

    messageInput.placeholder = `Message @${profile.username}`
}

async function loadInitialMessages() {
    if (!selectedUser) return

    const { data, error } = await supabase
        .from('messages')
        .select('id, content, user_id, created_at')
        .or(`and(user_id.eq.${user.id},dm_to.eq.${selectedUser.id}),and(user_id.eq.${selectedUser.id},dm_to.eq.${user.id})`)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT)

    if (error) return alert('Failed to load messages: ' + error.message)

    const messages = data.reverse()
    for (const msg of messages) await appendMessage(msg)
    oldestTimestamp = messages[0]?.created_at || null
    scrollToBottom()
}

async function loadOlderMessagesOnScroll() {
    if (messagesList.scrollTop !== 0 || loadingOlderMessages || !oldestTimestamp) return
    loadingOlderMessages = true

    const { data, error } = await supabase
        .from('messages')
        .select('id, content, user_id, created_at')
        .or(`and(user_id.eq.${user.id},dm_to.eq.${selectedUser.id}),and(user_id.eq.${selectedUser.id},dm_to.eq.${user.id})`)
        .lt('created_at', oldestTimestamp)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT)

    if (error) {
        console.error('Failed to load older messages:', error.message)
        loadingOlderMessages = false
        return
    }

    const prevHeight = messagesList.scrollHeight
    for (const msg of data.reverse()) await prependMessage(msg)
    oldestTimestamp = data[0]?.created_at || oldestTimestamp
    messagesList.scrollTop = messagesList.scrollHeight - prevHeight
    loadingOlderMessages = false
}

function subscribeToMessages() {
    if (!selectedUser) return

    messageSubscription = supabase
        .channel('realtime:dms')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            const msg = payload.new
            const isBetweenUsers =
                (msg.user_id === user.id && msg.dm_to === selectedUser.id) ||
                (msg.user_id === selectedUser.id && msg.dm_to === user.id)

            if (isBetweenUsers) {
                await appendMessage(msg)
                scrollToBottom()
            }
        })
        .subscribe()
}

function removeSubscription() {
    if (messageSubscription) {
        supabase.removeChannel(messageSubscription)
        messageSubscription = null
    }
}

async function appendMessage(msg) {
    const userName = msg.user_id === user.id ? 'You' : selectedUser.username
    const parsed = parseLinks(msg.content)
    const li = document.createElement('li')
    li.classList.add('message')
    li.innerHTML = `<div class="message-content"><span class="message-username">${userName}</span><br/><span class="message-text">${parsed}</span></div>`
    messagesList.appendChild(li)
}

async function prependMessage(msg) {
    const userName = msg.user_id === user.id ? 'You' : selectedUser.username
    const parsed = parseLinks(msg.content)
    const li = document.createElement('li')
    li.classList.add('message')
    li.innerHTML = `<div class="message-content"><span class="message-username">${userName}</span><br/><span class="message-text">${parsed}</span></div>`
    messagesList.insertBefore(li, messagesList.firstChild)
}

function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight
}

messageForm.addEventListener('submit', async e => {
    e.preventDefault()
    if (!selectedUser) return alert('Select a user to chat with')

    const content = messageInput.value.trim()
    if (!content) return

    const { error } = await supabase.from('messages').insert([{
        content,
        user_id: user.id,
        dm_to: selectedUser.id
    }])

    if (error) return alert('Failed to send message: ' + error.message)

    messageInput.value = ''
    messageInput.focus()
})
