import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const messagesList = document.getElementById('messages')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const profileNameEl = document.getElementById('profile-username')
const messageSound = new Audio('notification.mp3');
const welcomeMsg = document.getElementById("welcome-msg");
const modalUsername = document.getElementById('modal-username')

let user = null
const userCache = new Map()
let lastFetchedTimestamp = null
let earliestFetchedTimestamp = null
let isLoadingOlderMessages = false

const PAGE_SIZE = 20 // Number of messages per page

let unreadCount = 0;

init()

let currentUserRole = "user" // default

async function init() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) {
        window.location.href = '../index.html'
        return
    }

    user = session.user

    // 🔑 Fetch role before loading messages
    const { data: roleData, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!roleError && roleData?.role) {
        currentUserRole = roleData.role
    }

    console.log("Logged in as:", currentUserRole)

    await loadProfileUsername(user.id)

    // 👉 only now load messages
    await loadMessages()
    subscribeToNewMessages()
    setupInfiniteScroll()

    welcomeMsg.textContent = "Welcome to OpenChat " + await loadProfileUsername(user.id) + "!";
    modalUsername.textContent = await loadProfileUsername(user.id);
}

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
    return username   // <-- return it here
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
    const userInfo = await getUserInfo(msg.user_id);

    // Determine display name
    const selfInfo = await getUserInfo(user.id);
    const userName = msg.user_id === user.id ? selfInfo.username : userInfo.username;

    const li = document.createElement('li');
    li.classList.add('message');
    li.dataset.messageId = msg.id;

    // --- Avatar ---
    const avatar = document.createElement('img');
    avatar.classList.add('message-avatar');
    avatar.src = userInfo.avatar_url || '../assets/images/default-avatar.png';
    avatar.alt = userName + "'s avatar";

    // --- Message content (username + text) ---
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    const usernameEl = document.createElement('div');
    usernameEl.classList.add('message-username');
    usernameEl.textContent = userName;
    usernameEl.style.color = '#48BB78';

    const textEl = document.createElement('div');
    textEl.classList.add('message-text');
    if (msg.content.startsWith('__img__')) {
        const imageUrl = msg.content.replace('__img__', '');
        textEl.innerHTML = `<img src="${imageUrl}" alt="Image" style="max-width:300px;border-radius:8px;margin-top:5px;" />`;
    } else {
        textEl.innerHTML = parseLinks(msg.content);
    }

    contentDiv.appendChild(usernameEl);
    contentDiv.appendChild(textEl);

    // --- Admin tools ---
    if (currentUserRole === "admin" && msg.user_id !== user.id) {
        const adminDiv = document.createElement('div');
        adminDiv.classList.add('admin-tools');

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = "🗑️ Delete";
        deleteBtn.addEventListener('click', () => deleteMessage(msg.id, li));

        const timeoutBtn = document.createElement('button');
        timeoutBtn.textContent = "⏱️ Timeout";
        timeoutBtn.addEventListener('click', () => timeoutUser(msg.user_id));

        adminDiv.appendChild(deleteBtn);
        adminDiv.appendChild(timeoutBtn);
        li.appendChild(adminDiv);
    }

    // --- Combine avatar + content ---
    li.appendChild(avatar);
    li.appendChild(contentDiv);

    return li;
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
            // Only handle public messages
            if (payload.new.dm_to === null) {
                await appendMessage(payload.new)
                lastFetchedTimestamp = payload.new.created_at
            }
        }
    )

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to live public messages!')
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

    const userInfo = await getUserInfo(msg.user_id);
    // Only notify if tab not focused
    if (msg.user_id !== user.id && document.hidden) {
        unreadCount++
        updateFavicon(unreadCount)

        if (Notification.permission === "granted") {
            new Notification("OpenChat ~ " + userInfo.username, { body: msg.content })
        }
        messageSound.play().catch(() => { })
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            unreadCount = 0
            updateFavicon(0)
        }
    })

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

    // check timeout
    const { data: userData } = await supabase
        .from('users')
        .select('timeout_until')
        .eq('id', user.id)
        .single()

    if (userData?.timeout_until && new Date(userData.timeout_until) > new Date()) {
        alert("You are currently timed out.")
        return
    }

    const { error } = await supabase.from('messages').insert([{ content, user_id: user.id, dm_to: null }])
    if (error) return alert('Failed to send message: ' + error.message)

    messageInput.value = ''
    messageInput.focus()
})

function updateFavicon(unread) {
    const size = 64
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")

    const baseIcon = new Image()
    baseIcon.crossOrigin = "anonymous" // avoid tainting if hosted elsewhere
    baseIcon.src = "/assets/images/openchat.jpeg" // your default favicon

    baseIcon.onload = () => {
        // draw original favicon
        ctx.drawImage(baseIcon, 0, 0, size, size)

        if (unread > 0) {
            // red badge
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

        // remove old favicons
        document.querySelectorAll("link[rel~='icon']").forEach(el => el.remove())

        // inject new one
        const newFavicon = document.createElement("link")
        newFavicon.rel = "icon"
        newFavicon.type = "image/png"
        newFavicon.href = canvas.toDataURL("image/png")
        document.head.appendChild(newFavicon)
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const profileTab = document.getElementById("profile");
    const profileModal = document.getElementById("profile-modal");
    const closeProfileModal = document.getElementById("close-profile-modal");

    const editBtn = document.getElementById("editName");
    const editForm = document.getElementById("editNameForm");
    const saveBtn = document.getElementById("saveName");
    const cancelBtn = document.getElementById("cancelEdit");
    const modalUsername = document.getElementById("modal-username");
    const profileUsername = document.getElementById("profile-username");
    const newDisplayNameInput = document.getElementById("newDisplayName");

    // Toggle modal
    profileTab.addEventListener("click", () => {
        profileModal.style.display =
            profileModal.style.display === "block" ? "none" : "block";
    });

    closeProfileModal.addEventListener("click", () => {
        profileModal.style.display = "none";
    });

    document.addEventListener("click", (e) => {
        if (!profileModal.contains(e.target) && !profileTab.contains(e.target)) {
            profileModal.style.display = "none";
        }
    });

    // ✅ Edit form logic
    editBtn.addEventListener("click", () => {
        editForm.style.display = "flex";
        newDisplayNameInput.value = modalUsername.textContent.trim();
        newDisplayNameInput.focus();
    });

    saveBtn.addEventListener("click", async () => {
        const newName = newDisplayNameInput.value.trim();
        if (!newName) return;

        const { data: { user: currentUser } } = await supabase.auth.getUser();

        // Update the database
        const { data, error } = await supabase
            .from('profiles') // replace with your table name
            .update({ username: newName })
            .eq('id', currentUser.id)

        if (error) {
            console.error("Error updating display name:", error.message);
            alert("Failed to update display name.");
            return;
        }

        // Update UI
        modalUsername.textContent = newName;
        profileUsername.textContent = newName; // sync with sidebar tab
        editForm.style.display = "none";
    });

    cancelBtn.addEventListener("click", () => {
        editForm.style.display = "none";
    });
});

const dmsButton = document.getElementById("dms_button");
const mainChatBtn = document.getElementById("main-chat");
const channelList = document.getElementById("channel-list");

let viewingDMUserId = null; // which user you're chatting with

dmsButton.addEventListener("click", async () => {
  // Clear and load user list
  channelList.innerHTML = "<li><strong>Direct Messages</strong></li>";

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, username")
    .neq("id", user.id); // exclude self

  if (error) {
    console.error("Error loading users:", error.message);
    return;
  }

  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u.username;
    li.classList.add("dm-user");
    li.addEventListener("click", () => loadDMConversation(u.id, u.username));
    channelList.appendChild(li);
  });

  dmsButton.classList.add("active");
  mainChatBtn.classList.remove("active");
});

mainChatBtn.addEventListener("click", async () => {
  channelList.innerHTML = "<li><strong>Channels</strong></li>";
  viewingDMUserId = null;
  await loadMessages(); // back to public chat
  mainChatBtn.classList.add("active");
  dmsButton.classList.remove("active");
});

// Load messages between logged-in user and target user
async function loadDMConversation(otherUserId, username) {
  viewingDMUserId = otherUserId;

  const { data, error } = await supabase
    .from("messages")
    .select("id, content, user_id, created_at, dm_to")
    .or(`and(user_id.eq.${user.id},dm_to.eq.${otherUserId}),and(user_id.eq.${otherUserId},dm_to.eq.${user.id})`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading DM conversation:", error.message);
    return;
  }

  messagesList.innerHTML = "";
  for (const msg of data) {
    const li = await createMessageElement(msg);
    messagesList.appendChild(li);
  }

  scrollToBottom();
  document.getElementById("message-input").placeholder = `Message @${username}`;
}

// Intercept send to support DMs
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;

  let newMessage = {
    content,
    user_id: user.id,
    dm_to: viewingDMUserId || null // <-- if in DM mode, set target
  };

  const { error } = await supabase.from("messages").insert([newMessage]);
  if (error) {
    alert("Failed to send message: " + error.message);
    return;
  }

  messageInput.value = "";
});
