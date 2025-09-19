import { supabase } from "./master";

const dmsButton = document.getElementById("dms_button");
const mainChatBtn = document.getElementById("main-chat");
const mainChatContainer = document.getElementById("main-chat-container");
const dmsContainer = document.getElementById("dms-container");

dmsButton.addEventListener("click", () => {
  mainChatContainer.style.display = "none";
  dmsContainer.style.display = "block";
  mainChatBtn.classList.remove("active");
  dmsButton.classList.add("active");

  // Load DMs JS
  import("./dms.js").then(module => {
    console.log("DMs module loaded");
  });
});

mainChatBtn.addEventListener("click", () => {
  dmsContainer.style.display = "none";
  mainChatContainer.style.display = "block";
  dmsButton.classList.remove("active");
  mainChatBtn.classList.add("active");
});

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
