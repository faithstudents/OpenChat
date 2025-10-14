import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// |-------------------------------------------------   |
// |                  Variables                         |
// |-------------------------------------------------   |
const messagesList = document.getElementById('messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const profileNameEl = document.getElementById('profile-username')
const messageSound = new Audio('notification.mp3')
const welcomeMsg = document.getElementById("welcome-msg")
const modalUsername = document.getElementById('modal-username')
const dmsButton = document.getElementById("dms_button")
const mainChatBtn = document.getElementById("main-chat")
const channelList = document.getElementById("channel-list")
const uploadImageBtn = document.getElementById("upload-image-btn")
const imageInput = document.getElementById("image-input")

let user = null
const userCache = new Map()
let lastFetchedTimestamp = null
let earliestFetchedTimestamp = null
let isLoadingOlderMessages = false
let unreadCount = 0
let viewingDMUserId = null
let currentUserRole = "user" // default
const PAGE_SIZE = 20 // messages per page

let lastMessageUserId = null
let lastMessageTime = null
const MESSAGE_GROUP_INTERVAL = 1 * 60 * 1000 // 1 minute

// -------------------- INIT --------------------
init()

async function init() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) return window.location.href = '../index.html'

    user = session.user

    // Fetch user role
    const { data: roleData, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!roleError && roleData?.role) currentUserRole = roleData.role
    console.log("Logged in as:", currentUserRole)

    const username = await loadProfileUsername(user.id)
    welcomeMsg.textContent = "Welcome to OpenChat " + username + "!"
    modalUsername.textContent = username

    await loadMessages()
    subscribeToNewMessages()
    setupInfiniteScroll()
}

// -------------------- PROFILE --------------------
async function loadProfileUsername(userId) {
    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single()

    const username = (profileError || !profileData?.username)
        ? user.email.split('@')[0]
        : profileData.username

    profileNameEl.textContent = username
    return username
}

// -------------------- MESSAGES --------------------
async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('id, content, user_id, created_at, reply_to')
        .is('dm_to', null)
        .order('created_at', { ascending: false }) // DESCENDING to get latest messages
        .limit(PAGE_SIZE)

    if (error) return console.error('Error loading messages:', error.message)

    messagesList.innerHTML = ''
    lastMessageUserId = null
    lastMessageTime = null

    // reverse so newest appear at the bottom
    const reversedData = data.reverse()

    const fragment = document.createDocumentFragment()
    for (const msg of reversedData) {
        const now = new Date(msg.created_at)
        let group = false
        if (lastMessageUserId === msg.user_id && lastMessageTime && now - lastMessageTime < MESSAGE_GROUP_INTERVAL) {
            group = true
        }
        fragment.appendChild(await createMessageElement(msg, group))
        lastMessageUserId = msg.user_id
        lastMessageTime = now
    }

    messagesList.appendChild(fragment)

    if (reversedData.length > 0) {
        lastFetchedTimestamp = reversedData[reversedData.length - 1].created_at
        earliestFetchedTimestamp = reversedData[0].created_at
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
    if (!data.length) return

    const fragment = document.createDocumentFragment()
    for (const msg of data) {
        fragment.appendChild(await createMessageElement(msg))
        lastFetchedTimestamp = msg.created_at
    }
    messagesList.appendChild(fragment)
    scrollToBottom()
}

function setupInfiniteScroll() {
    messagesList.addEventListener('scroll', async () => {
        if (messagesList.scrollTop !== 0 || isLoadingOlderMessages || !earliestFetchedTimestamp) return
        isLoadingOlderMessages = true

        const { data, error } = await supabase
            .from('messages')
            .select('id, content, user_id, created_at')
            .is('dm_to', null)
            .lt('created_at', earliestFetchedTimestamp)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

        if (error) { console.error(error.message); isLoadingOlderMessages = false; return }
        if (!data.length) { isLoadingOlderMessages = false; return }

        const fragment = document.createDocumentFragment()
        for (const msg of data.reverse()) fragment.appendChild(await createMessageElement(msg))

        const prevScrollHeight = messagesList.scrollHeight
        messagesList.prepend(fragment)
        messagesList.scrollTop = messagesList.scrollHeight - prevScrollHeight

        earliestFetchedTimestamp = data[0].created_at
        isLoadingOlderMessages = false
    })
}

async function createMessageElement(msg, group = false) {
    const userInfo = await getUserInfo(msg.user_id)
    const selfInfo = await getUserInfo(user.id)
    const userName = msg.user_id === user.id ? selfInfo.username : userInfo.username

    const li = document.createElement('li')
    li.classList.add('message')
    if (group) li.classList.add('message-grouped')
    li.dataset.messageId = msg.id

    const contentDiv = document.createElement('div')
    contentDiv.classList.add('message-content')

    // Show avatar + username only if NOT grouped
    // Inside createMessageElement(), replace header section with:
    if (!group) {
        const avatar = document.createElement('img')
        avatar.classList.add('message-avatar')
        avatar.src = userInfo.avatar_url || '../assets/images/default-avatar.png'
        avatar.alt = `${userName}'s avatar`
        li.appendChild(avatar)

        const headerDiv = document.createElement('div')
        headerDiv.classList.add('message-header')

        const usernameEl = document.createElement('div')
        usernameEl.classList.add('message-username')
        usernameEl.textContent = userName
        usernameEl.style.color = '#48BB78'

        // Create buttons container
        const buttonsContainer = document.createElement('div')
        buttonsContainer.style.display = 'flex'
        buttonsContainer.style.gap = '6px'

        const replyBtn = document.createElement('button')
        replyBtn.textContent = '↩️ Reply'
        replyBtn.classList.add('reply-btn')
        replyBtn.addEventListener('click', async () => {
            const replyUserInfo = await getUserInfo(msg.user_id)
            messageInput.dataset.replyTo = msg.id
            messageInput.focus()

            const previewBox = document.getElementById('reply-preview')
            const previewUser = document.getElementById('reply-user')
            const previewText = document.getElementById('reply-text')

            previewUser.textContent = replyUserInfo.username
            previewText.textContent = msg.content.length > 50 ? msg.content.slice(0, 50) + "..." : msg.content
            previewBox.style.display = 'block'
        })

        const replyPreview = document.getElementById('reply-preview')
        const closeReplyBtn = document.getElementById('cancel-reply')

        // Close when clicking the X button
        closeReplyBtn.addEventListener('click', () => {
            replyPreview.style.display = 'none'
            delete messageInput.dataset.replyTo
        })

        // Close when pressing Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && replyPreview.style.display === 'block') {
                replyPreview.style.display = 'none'
                delete messageInput.dataset.replyTo
            }
        })

        const deleteBtn = document.createElement('button')
        deleteBtn.textContent = '🗑️'
        deleteBtn.classList.add('delete-btn')
        deleteBtn.addEventListener('click', () => deleteMessage(msg.id, li))

        buttonsContainer.appendChild(replyBtn)
        buttonsContainer.appendChild(deleteBtn)

        headerDiv.appendChild(usernameEl)
        headerDiv.appendChild(buttonsContainer)
        contentDiv.appendChild(headerDiv)
    }

    // MESSAGE TEXT
    const textEl = document.createElement('div')
    textEl.classList.add('message-text')
    if (msg.content.startsWith('__img__')) {
        textEl.innerHTML = `<img src="${msg.content.replace('__img__', '')}" alt="Image" style="max-width:300px;border-radius:8px;margin-top:5px;" />`
    } else {
        textEl.innerHTML = parseLinks(msg.content)
    }
    contentDiv.appendChild(textEl)
    li.appendChild(contentDiv)

    // Reply preview
    if (msg.reply_to) {
        try {
            const { data: replyData, error: replyError } = await supabase
                .from('messages')
                .select('content, user_id')
                .eq('id', msg.reply_to)
                .single()

            if (!replyError && replyData) {
                const replyUserInfo = await getUserInfo(replyData.user_id) // <- make sure we await this
                const replyDiv = document.createElement('div')
                replyDiv.classList.add('message-reply')
                replyDiv.textContent = `↪ @${replyUserInfo.username}: ${replyData.content.slice(0, 50)}${replyData.content.length > 50 ? "..." : ""}`
                replyDiv.style.fontStyle = 'italic'
                replyDiv.style.fontSize = '0.85em'
                replyDiv.style.marginBottom = '4px'

                // Insert **above** message text
                contentDiv.insertBefore(replyDiv, textEl)
            }
        } catch (err) {
            console.error("Failed to load reply message:", err)
        }
    }

    // Admin tools
    if (currentUserRole === "admin" && msg.user_id !== user.id && !group) {
        const adminDiv = document.createElement('div')
        adminDiv.classList.add('admin-tools')

        const deleteBtn = document.createElement('button')
        deleteBtn.textContent = "🗑️ Delete"
        deleteBtn.addEventListener('click', () => deleteMessage(msg.id, li))

        const timeoutBtn = document.createElement('button')
        timeoutBtn.textContent = "⏱️ Timeout"
        timeoutBtn.addEventListener('click', () => timeoutUser(msg.user_id))

        adminDiv.appendChild(deleteBtn)
        adminDiv.appendChild(timeoutBtn)
        li.appendChild(adminDiv)
    }

    if (group) li.style.marginTop = '-4px'

    return li
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
        username = (userError || !userData?.email) ? 'Unknown' : userData.email.split('@')[0]
    } else username = profileData.username

    const userInfo = { id: userId, username }
    userCache.set(userId, userInfo)
    return userInfo
}

async function appendMessage(msg) {
    const userInfo = await getUserInfo(msg.user_id)
    const now = new Date(msg.created_at)
    let shouldGroup = false

    if (lastMessageUserId === msg.user_id && lastMessageTime) {
        const diff = now - lastMessageTime
        if (diff < MESSAGE_GROUP_INTERVAL) shouldGroup = true
    }

    const li = await createMessageElement(msg, shouldGroup)
    messagesList.appendChild(li)

    lastMessageUserId = msg.user_id
    lastMessageTime = now

    if (msg.user_id !== user.id && document.hidden) {
        unreadCount++
        updateFavicon(unreadCount)
        if (Notification.permission === "granted") new Notification("OpenChat ~ " + userInfo.username, { body: msg.content })
        messageSound.play().catch(() => { })
    }

    scrollToBottom()
}

// -------------------- DELETE MESSAGE --------------------
async function deleteMessage(messageId, messageElement) {
    const confirmDelete = confirm("Delete this message?");
    if (!confirmDelete) return;

    try {
        const { error } = await supabase
            .from("messages")
            .delete()
            .eq("id", messageId);

        if (error) {
            console.error("Error deleting message:", error.message);
            alert("Failed to delete message.");
            return;
        }

        // Remove from UI
        messageElement.remove();
        console.log(`Message ${messageId} deleted.`);
    } catch (err) {
        console.error("Unexpected error deleting message:", err);
    }
}

function parseLinks(content) {
    const urlRegex = /https?:\/\/[^\s]+/g
    return content.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #00aaff;">${url}</a>`)
}

function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight
}

// -------------------- REALTIME --------------------
let messageChannel = null

function subscribeToNewMessages() {
    // Remove previous subscription
    if (messageChannel) supabase.removeChannel(messageChannel)

    // Create a new channel
    messageChannel = supabase.channel('messages')

    messageChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async payload => {
            const msg = payload.new

            // ---- PUBLIC CHAT ----
            if (!viewingDMUserId && msg.dm_to === null) {
                await appendMessage(msg)
                lastFetchedTimestamp = msg.created_at
                return
            }

            // ---- DM CHAT ----
            if (viewingDMUserId) {
                const isFromOther = msg.user_id === viewingDMUserId && msg.dm_to === user.id
                const isFromSelf = msg.user_id === user.id && msg.dm_to === viewingDMUserId
                if (isFromOther || isFromSelf) {
                    await appendMessage(msg)
                    lastFetchedTimestamp = msg.created_at
                }
            }
        }
    )

    if (messageChannel.subscribe()) {
        console.log("Subscribed to Supabase Realtime! :D\n");
    } else {
        console.log("Unable to Subscribe to Supabase Realtime! :(\n");
    }
}

// -------------------- SEND MESSAGE --------------------
messageForm.addEventListener("submit", async e => {
    e.preventDefault()
    const content = messageInput.value.trim()
    if (!content) return

    const { data: userData } = await supabase
        .from("users")
        .select("timeout_until")
        .eq("id", user.id)
        .single()

    if (userData?.timeout_until && new Date(userData.timeout_until) > new Date()) {
        alert("You are currently timed out.")
        return
    }

    const newMessage = {
        content,
        user_id: user.id,
        dm_to: viewingDMUserId || null,
        reply_to: messageInput.dataset.replyTo || null  // <-- reply reference
    }

    const { error } = await supabase.from("messages").insert([newMessage])
    if (error) return alert("Failed to send message: " + error.message)

    messageInput.value = ""
    messageInput.placeholder = viewingDMUserId ? `Message @${viewingDMUserId}` : "Type a message..."
    delete messageInput.dataset.replyTo  // clear reply state
})

// -------------------- FAVICON --------------------
function updateFavicon(unread) {
    const size = 64
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    const baseIcon = new Image()
    baseIcon.crossOrigin = "anonymous"
    baseIcon.src = "/assets/images/openchat.jpeg"

    baseIcon.onload = () => {
        ctx.drawImage(baseIcon, 0, 0, size, size)
        if (unread > 0) {
            ctx.beginPath()
            ctx.arc(size - 16, 16, 14, 0, 2 * Math.PI)
            ctx.fillStyle = "#FF0000"
            ctx.fill()
            ctx.fillStyle = "#fff"
            ctx.font = "bold 28px Arial"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(unread > 9 ? "9+" : unread, size - 16, 16)
        }

        document.querySelectorAll("link[rel~='icon']").forEach(el => el.remove())
        const newFavicon = document.createElement("link")
        newFavicon.rel = "icon"
        newFavicon.type = "image/png"
        newFavicon.href = canvas.toDataURL("image/png")
        document.head.appendChild(newFavicon)
    }
}

// -------------------- PROFILE MODAL --------------------
document.addEventListener("DOMContentLoaded", () => {
    const profileTab = document.getElementById("profile")
    const profileModal = document.getElementById("profile-modal")
    const closeProfileModal = document.getElementById("close-profile-modal")
    const editBtn = document.getElementById("editName")
    const editForm = document.getElementById("editNameForm")
    const saveBtn = document.getElementById("saveName")
    const cancelBtn = document.getElementById("cancelEdit")
    const newDisplayNameInput = document.getElementById("newDisplayName")
    const profileUsername = document.getElementById("profile-username")

    profileTab.addEventListener("click", () => {
        profileModal.style.display = profileModal.style.display === "block" ? "none" : "block"
    })
    closeProfileModal.addEventListener("click", () => profileModal.style.display = "none")
    document.addEventListener("click", e => {
        if (!profileModal.contains(e.target) && !profileTab.contains(e.target)) profileModal.style.display = "none"
    })

    editBtn.addEventListener("click", () => {
        editForm.style.display = "flex"
        newDisplayNameInput.value = modalUsername.textContent.trim()
        newDisplayNameInput.focus()
    })

    saveBtn.addEventListener("click", async () => {
        const newName = newDisplayNameInput.value.trim()
        if (!newName) return

        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('profiles')
            .update({ username: newName })
            .eq('id', currentUser.id)

        if (error) return alert("Failed to update display name.")

        modalUsername.textContent = newName
        profileUsername.textContent = newName
        editForm.style.display = "none"
    })

    cancelBtn.addEventListener("click", () => editForm.style.display = "none")
})

// -------------------- DM HANDLING --------------------
dmsButton.addEventListener("click", async () => {
    channelList.innerHTML = "<li><strong>Direct Messages</strong></li>"
    const { data: users, error } = await supabase
        .from("profiles")
        .select("id, username")
        .neq("id", user.id)

    if (error) return console.error("Error loading users:", error.message)

    users.forEach(u => {
        const li = document.createElement("li")
        li.textContent = u.username
        li.classList.add("dm-user")
        li.addEventListener("click", () => loadDMConversation(u.id, u.username))
        channelList.appendChild(li)
    })

    dmsButton.classList.add("active")
    mainChatBtn.classList.remove("active")
})

mainChatBtn.addEventListener("click", async () => {
    channelList.innerHTML = "<li><strong>Channels</strong></li>"
    viewingDMUserId = null
    await loadMessages()
    mainChatBtn.classList.add("active")
    dmsButton.classList.remove("active")
})

async function loadDMConversation(otherUserId, username) {
    viewingDMUserId = otherUserId
    lastFetchedTimestamp = null
    earliestFetchedTimestamp = null

    const { data, error } = await supabase
        .from("messages")
        .select("id, content, user_id, created_at, dm_to")
        .or(`and(user_id.eq.${user.id},dm_to.eq.${otherUserId}),and(user_id.eq.${otherUserId},dm_to.eq.${user.id})`)
        .order("created_at", { ascending: true })

    if (error) return console.error("Error loading DM conversation:", error.message)

    messagesList.innerHTML = ""
    for (const msg of data) messagesList.appendChild(await createMessageElement(msg))
    scrollToBottom()

    messageInput.placeholder = `Message @${username}`

    // Re-subscribe for the active DM
    subscribeToNewMessages()
}


// ----------------- Image handling ------------------
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

// --------------- Scroll to bottom button ------------------
const scrollBottomBtn = document.getElementById('scroll-bottom-btn')

// Show button when user scrolls up
messagesList.addEventListener('scroll', () => {
    if (messagesList.scrollTop + messagesList.clientHeight < messagesList.scrollHeight - 50) {
        scrollBottomBtn.style.display = 'block'
    } else {
        scrollBottomBtn.style.display = 'none'
    }
})

// Scroll to bottom when button clicked
scrollBottomBtn.addEventListener('click', () => {
    messagesList.scrollTop = messagesList.scrollHeight
    scrollBottomBtn.style.display = 'none'
})
