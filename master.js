import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Supabase configuration
const SUPABASE_URL = 'https://htwevjqqqyojcbgeevqy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2V2anFxcXlvamNiZ2VldnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDg0NzYsImV4cCI6MjA2ODg4NDQ3Nn0.lszlnu4aWcDRAhp_MjJaECRFzGYze_uP7GhfWszA6fY'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const messagesList = document.getElementById('messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const profileNameEl = document.getElementById('profile-username')

const messageSound = new Audio('notification.mp3');
const dmSound = new Audio('dm.mp3');

const imageInput = document.getElementById('image-input')
const uploadImageBtn = document.getElementById('upload-image-btn')

const isOnDMPage = window.location.pathname.includes('dms.html');

let user = null
const userCache = new Map()
let lastFetchedTimestamp = null
let earliestFetchedTimestamp = null
let isLoadingOlderMessages = false

const PAGE_SIZE = 20 // Number of messages per page

init()

async function init() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) {
        window.location.href = 'index.html'
        return
    }

    user = session.user
    console.log('Logged in user:', user)

    await loadProfileUsername(user.id)
    await loadMessages()
    subscribeToNewMessages()
    setupInfiniteScroll()
}

async function loadProfileUsername(userId) {
    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single()

    profileNameEl.textContent = (profileError || !profileData?.username)
        ? user.email.split('@')[0]
        : profileData.username
}

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('id, content, user_id, created_at')
        .is('dm_to', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

    if (error) return console.error('Error loading messages:', error.message)

    messagesList.innerHTML = ''
    const fragment = document.createDocumentFragment()

    // reverse so newest are at bottom
    for (const msg of data.reverse()) {
        const li = await createMessageElement(msg)
        fragment.appendChild(li)
    }

    messagesList.appendChild(fragment)

    if (data.length > 0) {
        lastFetchedTimestamp = data[data.length - 1].created_at
        earliestFetchedTimestamp = data[0].created_at
    }

    scrollToBottom()
}

async function fetchNewMessages() {
    if (!lastFetchedTimestamp) return

    const { data, error } = await supabase
        .from('messages')
        .select('id, content, user_id, created_at')
        .gt('created_at', lastFetchedTimestamp)
        .is('dm_to', null)
        .order('created_at', { ascending: true })

    if (error) return console.error('Error fetching new messages:', error.message)
    if (data.length === 0) return

    const fragment = document.createDocumentFragment()
    for (const msg of data) {
        const li = await createMessageElement(msg)
        fragment.appendChild(li)
        lastFetchedTimestamp = msg.created_at
    }

    messagesList.appendChild(fragment)

    // create a new notification and send it
    Notification.requestPermision().then((perm) => {
        console.log(perm);
    });

    const notification = new Notification("OpenChat ~ " + msg.username, {
        body: msg.content,
    });
    
    scrollToBottom()
}

// Load older messages when scrolling to top
function setupInfiniteScroll() {
    messagesList.addEventListener('scroll', async () => {
        if (messagesList.scrollTop === 0 && !isLoadingOlderMessages && earliestFetchedTimestamp) {
            isLoadingOlderMessages = true

            const { data, error } = await supabase
                .from('messages')
                .select('id, content, user_id, created_at')
                .is('dm_to', null)
                .lt('created_at', earliestFetchedTimestamp)
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE)

            if (error) {
                console.error('Error loading older messages:', error.message)
                isLoadingOlderMessages = false
                return
            }

            if (data.length === 0) {
                isLoadingOlderMessages = false
                return
            }

            const fragment = document.createDocumentFragment()
            for (const msg of data.reverse()) {
                const li = await createMessageElement(msg)
                fragment.appendChild(li)
            }

            // preserve scroll position
            const prevScrollHeight = messagesList.scrollHeight
            messagesList.prepend(fragment)
            const newScrollHeight = messagesList.scrollHeight
            messagesList.scrollTop = newScrollHeight - prevScrollHeight

            earliestFetchedTimestamp = data[0].created_at
            isLoadingOlderMessages = false
        }
    })
}

async function createMessageElement(msg) {
    const userInfo = await getUserInfo(msg.user_id)
    const userName = msg.user_id === user.id ? 'You' : userInfo.username

    const li = document.createElement('li')
    li.classList.add('message')

    const contentDiv = document.createElement('div')
    contentDiv.classList.add('message-content')

    if (msg.content.startsWith('__img__')) {
        const imageUrl = msg.content.replace('__img__', '')
        contentDiv.innerHTML = `<strong>${userName}:</strong><br><img src="${imageUrl}" alt="Image" style="max-width: 300px; border-radius: 8px; margin-top: 5px;" />`
    } else {
        const parsedContent = parseLinks(msg.content)
        contentDiv.innerHTML = `<strong>${userName}:</strong> ${parsedContent}`
    }

    const reactionsDiv = document.createElement('div')
    reactionsDiv.classList.add('reactions')
    reactionsDiv.innerHTML = '<button>😀</button> <button>❤️</button> <button>👍</button> <button>👎</button>'

    li.appendChild(contentDiv)
    li.appendChild(reactionsDiv)
    return li
}

function subscribeToNewMessages() {
    const channel = supabase.channel('public-messages')

    channel.on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        },
        async (payload) => {
            console.log('New message payload:', payload) // <-- see if anything logs
            await appendMessage(payload.new)
            lastFetchedTimestamp = payload.new.created_at
        }
    )

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to live messages!')
        } else if (status === 'ERROR') {
            console.error('Subscription failed.')
        }
    })
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

        username = (userError || !userData?.email)
            ? 'Unknown'
            : userData.email.split('@')[0]
    } else {
        username = profileData.username
    }

    const userInfo = { id: userId, username }
    userCache.set(userId, userInfo)
    return userInfo
}

async function appendMessage(msg) {
    const li = await createMessageElement(msg)
    messagesList.appendChild(li)
    scrollToBottom()
}

function parseLinks(content) {
    const urlRegex = /https?:\/\/[^\s]+/g
    return content.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #00aaff;">${url}</a>`)
}

function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight
}

// Sending messages
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const content = messageInput.value.trim()
    if (!content) return

    const { error } = await supabase.from('messages').insert([{ content, user_id: user.id, dm_to: null }])
    if (error) return alert('Failed to send message: ' + error.message)

    messageInput.value = ''
    messageInput.focus()
})

// Image upload
uploadImageBtn.addEventListener('click', () => imageInput.click())
imageInput.addEventListener('change', async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `uploads/${fileName}`

    const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file)
    if (uploadError) return alert('Image upload failed: ' + uploadError.message)

    const { data } = supabase.storage.from('images').getPublicUrl(filePath)
    const imageMessage = `__img__${data.publicUrl}`

    const { error: insertError } = await supabase.from('messages').insert([{ content: imageMessage, user_id: user.id, dm_to: null }])
    if (insertError) return alert('Failed to send image message: ' + insertError.message)

    imageInput.value = ''
})
