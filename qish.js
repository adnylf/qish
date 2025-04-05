const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const querystring = require("querystring");
const fs = require("fs");

const token = "7606738116:AAF3GFwEGWhpUn9mm0MBrG-LTOJxAfX1KE8";
const bot = new TelegramBot(token, { polling: true });

const USER_DATA_FILE = "user_data.json";

const customHeaders = {
  "Sec-Ch-Ua-Mobile": "?0",
  "X-Sz-Sdk-Version": "3.1.0-2&1.5.1",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.63 Safari/537.36",
  "Content-Type": "application/json",
  "X-Api-Source": "pc",
  Accept: "application/json",
  "X-Shopee-Language": "id",
  "X-Requested-With": "XMLHttpRequest",
  "X-Csrftoken": "OIQrdP3ae2lduDeevb60tCm4cOKg7iXt",
  "Af-Ac-Enc-Sz-Token":
    "OazXiPqlUgm158nr1h09yA==|0/eMoV7m/rlUHbgxsRgRC/n0vyOe6XzhDMa2PcnZPv3ecioRaJQg2W7ur5GfhoDDEeuMz2az7GGj/8Y=|Pu2hbrwoH+45rDNC|08|3",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
};

const userSessions = new Map();

// Load or initialize user data
let userData = {};
try {
  if (fs.existsSync(USER_DATA_FILE)) {
    userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, "utf8"));
    cleanExpiredUserData(); // Bersihkan data saat bot dimulai
  }
} catch (error) {
  console.error("Error loading user data:", error);
}

// Save user data to file
function saveUserData() {
  cleanExpiredUserData(); // Bersihkan sebelum menyimpan
  try {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error("Error saving user data:", error);
  }
}

// Pembersihan otomatis setiap 1 jam
setInterval(() => {
  cleanExpiredUserData();
}, 60 * 60 * 1000); // 1 jam dalam milidetik

// Fungsi untuk menghapus data user yang sudah lebih dari 1 hari
function cleanExpiredUserData() {
  const now = new Date();
  const oneDayInMs = 24 * 60 * 60 * 1000; // 1 hari dalam milidetik

  for (const chatId in userData) {
    if (userData[chatId] && userData[chatId].accounts) {
      const initialAccountCount = userData[chatId].accounts.length;

      // Filter akun yang masih valid
      const expiredAccounts = userData[chatId].accounts.filter((account) => {
        const addedTime = new Date(account.addedAt);
        const timeDiff = now - addedTime;
        return timeDiff >= oneDayInMs;
      });

      userData[chatId].accounts = userData[chatId].accounts.filter(
        (account) => {
          const addedTime = new Date(account.addedAt);
          const timeDiff = now - addedTime;
          return timeDiff < oneDayInMs;
        }
      );

      if (userData[chatId].accounts.length < initialAccountCount) {
        if (userData[chatId].accounts.length === 0) {
          delete userData[chatId];
          bot.sendMessage(
            chatId,
            "semua akun shopee anda telah kedaluwarsa (lebih dari 1 hari) dan dihapus. silakan login kembali."
          );
        } else {
          if (
            userData[chatId].selectedAccountIndex >=
            userData[chatId].accounts.length
          ) {
            userData[chatId].selectedAccountIndex =
              userData[chatId].accounts.length - 1;
          }
          const expiredUsernames = expiredAccounts
            .map((acc) => acc.shopeeUsername)
            .join(", ");
          bot.sendMessage(
            chatId,
            `akun Shopee berikut telah kedaluwarsa (lebih dari 1 hari) dan dihapus: ${expiredUsernames}.`
          );
        }
        saveUserData();
        console.log(`[CLEANUP] expired accounts removed for chatId: ${chatId}`);
      }
    }
  }
}

const vouchers = {
  sfood1: {
    promotionId: 1119330872475652,
    signature:
      "50c4c183045d8afbe437929ae7f4871a875b1bddb1ac14f24fd17063641aa3a2",
  },
  sfood2: {
    promotionId: 1119330871951360,
    signature:
      "b3835c2693d1a8e921a0ada5fad0310a7ff8e0fdd0713eb62ca3f71a6badba4f",
  },
  sfood3: {
    promotionId: 1119330872082436,
    signature:
      "b9a8749491038b273261d253d1e79b86c7ddf9c8466d2c2f3765a56df895f5d2",
  },
  svid: {
    promotionId: 1120236758253568,
    signature:
      "fa1e0c4ab156234d65902ff4118da8d6579dc20103dd8faa8e9ad63cff14cc12",
  },
  slive: {
    promotionId: 1120234459774976,
    signature:
      "a306b43c68a72129ce1a0870a9b394682c38a4638ef1418088bcbff88c55ab40",
  },
};

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from.username || msg.from.first_name;

  if (text.startsWith("/start")) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔑 login", callback_data: "login_options" },
          { text: "❓ bantuan", callback_data: "help" },
        ],
      ],
    };

    bot.sendMessage(
      chatId,
      "selamat datang di bot shopee voucher!\n\nsilakan pilih menu di bawah ini:",
      {
        reply_markup: keyboard,
      }
    );
  } else if (
    userSessions.has(chatId) &&
    userSessions.get(chatId).awaitingCookie
  ) {
    const cookieInput = text.trim();
    const session = userSessions.get(chatId);
    session.awaitingCookie = false;

    if (cookieInput.startsWith("SPC_EC")) {
      await verifyCookieAndSaveUser(chatId, cookieInput, username);
    } else {
      bot.sendMessage(
        chatId,
        "format cookie tidak valid. cookie harus dimulai dengan 'SPC_EC'."
      );
      showMainMenu(chatId);
    }
  } else {
    showMainMenu(chatId);
  }
});

function showMainMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔑 login", callback_data: "login_options" },
        { text: "❓ bantuan", callback_data: "help" },
      ],
    ],
  };

  bot.sendMessage(
    chatId,
    "maaf, perintah tidak dikenali. silakan pilih menu di bawah ini:",
    {
      reply_markup: keyboard,
    }
  );
}

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;
  const username = callbackQuery.from.username || callbackQuery.from.first_name;

  if (action === "login_options") {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📱 login via scan qr", callback_data: "login_scan" },
          { text: "🍪 login via cookie", callback_data: "login_cookie" },
        ],
        [{ text: "🔙 kembali", callback_data: "back_to_main" }],
      ],
    };
    bot.sendMessage(chatId, "pilih metode login:", {
      reply_markup: keyboard,
    });
  } else if (action === "login_scan") {
    startScanProcess(chatId, null, username, true);
  } else if (action === "login_cookie") {
    if (!userSessions.has(chatId)) {
      userSessions.set(chatId, { awaitingCookie: true });
    } else {
      userSessions.get(chatId).awaitingCookie = true;
    }
    bot.sendMessage(chatId, "silakan kirimkan cookie SPC_EC anda:");
  } else if (action === "choose_voucher") {
    if (
      !userData[chatId] ||
      !userData[chatId].accounts ||
      userData[chatId].accounts.length === 0
    ) {
      bot.sendMessage(
        chatId,
        "kamu belum login. silakan login terlebih dahulu."
      );
      const keyboard = {
        inline_keyboard: [
          [{ text: "🔑 login", callback_data: "login_options" }],
        ],
      };
      bot.sendMessage(chatId, "pilih menu di bawah ini:", {
        reply_markup: keyboard,
      });
      return;
    }

    if (userData[chatId].accounts.length === 1) {
      showVoucherMenu(chatId);
    } else {
      showAccountSelectionMenu(chatId);
    }
  } else if (action.startsWith("select_account_")) {
    const accountIndex = parseInt(action.replace("select_account_", ""));

    if (
      userData[chatId] &&
      userData[chatId].accounts &&
      userData[chatId].accounts[accountIndex]
    ) {
      userData[chatId].selectedAccountIndex = accountIndex;
      saveUserData();
      showVoucherMenu(chatId);
    } else {
      bot.sendMessage(chatId, "akun tidak ditemukan. silakan login kembali.");
    }
  } else if (action.startsWith("voucher_")) {
    const selectedVoucher = action.replace("voucher_", "");
    if (
      userData[chatId] &&
      userData[chatId].accounts &&
      userData[chatId].accounts.length > 0
    ) {
      const accountIndex = userData[chatId].selectedAccountIndex || 0;
      const account = userData[chatId].accounts[accountIndex];
      claimVoucherWithCookie(chatId, selectedVoucher, account.cookie);
    } else {
      bot.sendMessage(
        chatId,
        "kamu belum login. silakan login terlebih dahulu."
      );
      const keyboard = {
        inline_keyboard: [
          [{ text: "🔑 login", callback_data: "login_options" }],
        ],
      };
      bot.sendMessage(chatId, "pilih menu di bawah ini:", {
        reply_markup: keyboard,
      });
    }
  } else if (action === "help") {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 kembali", callback_data: "back_to_main" }],
      ],
    };
    bot.sendMessage(
      chatId,
      "cara menggunakan bot:\n\n1. login menggunakan scan qr atau cookie\n2. pilih voucher yang ingin diklaim\n3. bot akan mengklaim voucher menggunakan akun anda",
      {
        reply_markup: keyboard,
      }
    );
  } else if (action === "back_to_main") {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔑 login", callback_data: "login_options" },
          { text: "🎫 pilih voucher", callback_data: "choose_voucher" },
        ],
        [{ text: "❓ bantuan", callback_data: "help" }],
      ],
    };

    bot.sendMessage(chatId, "menu utama:", {
      reply_markup: keyboard,
    });
  }
});

function showVoucherMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🎫 sfood 1", callback_data: "voucher_sfood1" },
        { text: "🎫 sfood 2", callback_data: "voucher_sfood2" },
      ],
      [
        { text: "🎫 sfood 3", callback_data: "voucher_sfood3" },
        { text: "🎫 svid", callback_data: "voucher_svid" },
      ],
      [{ text: "🎫 slive", callback_data: "voucher_slive" }],
      [{ text: "🔙 kembali", callback_data: "back_to_main" }],
    ],
  };

  let currentAccount = "Unknown";
  if (userData[chatId] && userData[chatId].accounts) {
    const accountIndex = userData[chatId].selectedAccountIndex || 0;
    if (userData[chatId].accounts[accountIndex]) {
      currentAccount = userData[chatId].accounts[accountIndex].shopeeUsername;
    }
  }

  bot.sendMessage(
    chatId,
    `akun aktif: ${currentAccount}\n\nsilakan pilih voucher yang ingin diklaim:`,
    {
      reply_markup: keyboard,
    }
  );
}

function showAccountSelectionMenu(chatId) {
  if (
    !userData[chatId] ||
    !userData[chatId].accounts ||
    userData[chatId].accounts.length === 0
  ) {
    bot.sendMessage(
      chatId,
      "kamu belum memiliki akun. silakan login terlebih dahulu."
    );
    return;
  }

  const accounts = userData[chatId].accounts;
  const inlineKeyboard = accounts.map((account, index) => {
    return [
      {
        text: `${account.shopeeUsername}`,
        callback_data: `select_account_${index}`,
      },
    ];
  });

  inlineKeyboard.push([{ text: "🔙 kembali", callback_data: "back_to_main" }]);

  const keyboard = {
    inline_keyboard: inlineKeyboard,
  };

  bot.sendMessage(chatId, "pilih akun shopee yang akan digunakan:", {
    reply_markup: keyboard,
  });
}

async function verifyCookieAndSaveUser(chatId, cookie, telegramUsername) {
  try {
    const userInfoResponse = await axios.get(
      "https://shopee.co.id/api/v4/account/basic/get_account_info",
      {
        headers: {
          ...customHeaders,
          Cookie: cookie,
        },
      }
    );

    if (userInfoResponse.data.data !== null) {
      const shopeeUsername = userInfoResponse.data.data.username;

      // Initialize user data structure if it doesn't exist
      if (!userData[chatId]) {
        userData[chatId] = {
          telegramUsername: telegramUsername,
          accounts: [],
          selectedAccountIndex: 0,
        };
      }

      // Ensure accounts is always an array
      if (!Array.isArray(userData[chatId].accounts)) {
        userData[chatId].accounts = [];
      }

      // Check if this Shopee account already exists
      const existingAccountIndex = userData[chatId].accounts.findIndex(
        (account) => account.shopeeUsername === shopeeUsername
      );

      if (existingAccountIndex >= 0) {
        // Update existing account
        userData[chatId].accounts[existingAccountIndex].cookie = cookie;
        userData[chatId].accounts[existingAccountIndex].addedAt =
          new Date().toISOString(); // Perbarui waktu
        userData[chatId].selectedAccountIndex = existingAccountIndex;
      } else {
        // Add new account
        userData[chatId].accounts.push({
          shopeeUsername: shopeeUsername,
          cookie: cookie,
          addedAt: new Date().toISOString(),
        });
        userData[chatId].selectedAccountIndex =
          userData[chatId].accounts.length - 1;
      }

      saveUserData();

      bot.sendMessage(
        chatId,
        `login berhasil!\nUsername Shopee: ${shopeeUsername}`
      );

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🎫 pilih voucher", callback_data: "choose_voucher" },
            { text: "❓ bantuan", callback_data: "help" },
          ],
        ],
      };

      bot.sendMessage(chatId, "silakan pilih menu:", {
        reply_markup: keyboard,
      });
    } else {
      bot.sendMessage(chatId, "cookie tidak valid atau telah kedaluwarsa.");
    }
  } catch (error) {
    console.error("Error verifying cookie:", error);
    bot.sendMessage(
      chatId,
      "gagal memverifikasi cookie. pastikan cookie valid dan belum kedaluwarsa."
    );
  }
}

async function startScanProcess(
  chatId,
  selectedVoucher,
  telegramUsername,
  isForLogin = false
) {
  try {
    if (userSessions.has(chatId) && !userSessions.get(chatId).awaitingCookie) {
      bot.sendMessage(
        chatId,
        "kamu sudah memiliki sesi aktif. mohon selesaikan atau batalkan terlebih dahulu."
      );
      return;
    }

    const session = {
      lastQrCodeId: null,
      lastStatus: "",
      intervalId: null,
      selectedVoucher: selectedVoucher,
      isForLogin: isForLogin,
      telegramUsername: telegramUsername,
    };

    userSessions.set(chatId, session);

    const qrResponse = await axios.get(
      "https://shopee.co.id/api/v2/authentication/gen_qrcode"
    );

    if (qrResponse.status === 200) {
      const qrData = qrResponse.data.data;
      session.lastQrCodeId = qrData.qrcode_id;

      const intervalId = setInterval(async () => {
        if (!session.lastQrCodeId) {
          clearInterval(intervalId);
          userSessions.delete(chatId);
          return;
        }

        const encodedQrCodeId = querystring.escape(session.lastQrCodeId);
        const statusResponse = await axios.get(
          `https://shopee.co.id/api/v2/authentication/qrcode_status?qrcode_id=${encodedQrCodeId}`
        );
        const statusData = statusResponse.data.data;
        const currentStatus = statusData.status;

        if (currentStatus !== session.lastStatus) {
          session.lastStatus = currentStatus;
          bot.sendMessage(chatId, `status qr: ${currentStatus.toLowerCase()}`);
          if (currentStatus === "EXPIRED") {
            clearInterval(intervalId);
            userSessions.delete(chatId);
          }
          if (currentStatus === "CONFIRMED") {
            const qrcodeToken = statusData.qrcode_token;
            const postData = {
              qrcode_token: qrcodeToken,
              device_sz_fingerprint:
                "OazXiPqlUgm158nr1h09yA==|0/eMoV7m/rlUHbgxsRgRC/n0vyOe6XzhDMa2PcnZPv3ecioRaJQg2W7ur5GfhoDDEeuMz2az7GGj/8Y=|Pu2hbrwoH+45rDNC|08|3",
              client_identifier: {
                security_device_fingerprint:
                  "OazXiPqlUgm158nr1h09yA==|0/eMoV7m/rlUHbgxsRgRC/n0vyOe6XzhDMa2PcnZPv3ecioRaJQg2W7ur5GfhoDDEeuMz2az7GGj/8Y=|Pu2hbrwoH+45rDNC|08|3",
              },
            };

            const loginResponse = await axios.post(
              "https://shopee.co.id/api/v2/authentication/qrcode_login",
              postData,
              {
                headers: customHeaders,
              }
            );

            let spcEcCookie = "";
            if (loginResponse.headers["set-cookie"]) {
              const cookies = loginResponse.headers["set-cookie"];
              for (const cookie of cookies) {
                if (cookie.startsWith("SPC_EC")) {
                  spcEcCookie = cookie.split(";")[0];
                  break;
                }
              }
            }

            try {
              const userInfoResponse = await axios.get(
                "https://shopee.co.id/api/v4/account/basic/get_account_info",
                {
                  headers: {
                    ...customHeaders,
                    Cookie: spcEcCookie,
                  },
                }
              );

              if (userInfoResponse.data.data !== null) {
                const shopeeUsername = userInfoResponse.data.data.username;

                if (!userData[chatId]) {
                  userData[chatId] = {
                    telegramUsername: session.telegramUsername,
                    accounts: [],
                    selectedAccountIndex: 0,
                  };
                }

                // Ensure accounts is always an array
                if (!Array.isArray(userData[chatId].accounts)) {
                  userData[chatId].accounts = [];
                }

                const existingAccountIndex = userData[
                  chatId
                ].accounts.findIndex(
                  (account) => account.shopeeUsername === shopeeUsername
                );

                if (existingAccountIndex >= 0) {
                  userData[chatId].accounts[existingAccountIndex].cookie =
                    spcEcCookie;
                  userData[chatId].accounts[existingAccountIndex].addedAt =
                    new Date().toISOString(); // Perbarui waktu
                  userData[chatId].selectedAccountIndex = existingAccountIndex;
                } else {
                  userData[chatId].accounts.push({
                    shopeeUsername: shopeeUsername,
                    cookie: spcEcCookie,
                    addedAt: new Date().toISOString(),
                  });
                  userData[chatId].selectedAccountIndex =
                    userData[chatId].accounts.length - 1;
                }

                saveUserData();

                bot.sendMessage(
                  chatId,
                  `login berhasil!\nUsername Shopee: ${shopeeUsername}`
                );

                if (session.isForLogin) {
                  const keyboard = {
                    inline_keyboard: [
                      [
                        {
                          text: "🎫 pilih voucher",
                          callback_data: "choose_voucher",
                        },
                        { text: "❓ bantuan", callback_data: "help" },
                      ],
                    ],
                  };

                  bot.sendMessage(chatId, "silakan pilih menu:", {
                    reply_markup: keyboard,
                  });
                } else if (session.selectedVoucher) {
                  const voucherData = vouchers[session.selectedVoucher];
                  const saveVoucherResponse = await axios.post(
                    "https://mall.shopee.co.id/api/v2/voucher_wallet/save_voucher",
                    {
                      voucher_promotionid: voucherData.promotionId,
                      signature: voucherData.signature,
                      security_device_fingerprint: "",
                      signature_source: "0",
                    },
                    {
                      headers: {
                        Cookie: spcEcCookie,
                        Accept: "application/json",
                        "Af-Ac-Enc-Dat": "",
                        "Af-Ac-Enc-Id": "",
                        "Af-Ac-Enc-Sz-Token": "",
                        "If-None-Match-":
                          "55b03-97d86fe6888b54a9c5bfa268cf3d922f",
                        Shopee_http_dns_mode: "1",
                        "User-Agent":
                          "Android app Shopee appver=30420 app_type=1",
                        "X-Api-Source": "rn",
                        "X-Sap-Access-F": "",
                        "X-Sap-Access-T": "",
                        "X-Shopee-Client-Timezone": "Asia/Jakarta",
                        "X-Csrftoken": "",
                        "Content-Type": "application/json; charset=utf-8",
                        "Accept-Encoding": "gzip, deflate, br",
                      },
                    }
                  );

                  if (saveVoucherResponse.data.error === 0) {
                    console.log(
                      `[SUCCESS] voucher ${session.selectedVoucher} claimed by user: ${shopeeUsername}`
                    );
                    bot.sendMessage(
                      chatId,
                      `voucher ${session.selectedVoucher} berhasil diklaim.\nusername: ${shopeeUsername}`
                    );
                  } else {
                    const errorMsg = saveVoucherResponse.data.error_msg;
                    console.log("[ERROR] failed to claim voucher:", errorMsg);
                    bot.sendMessage(
                      chatId,
                      `gagal mengklaim voucher: ${errorMsg.toLowerCase()}`
                    );
                  }
                }
              } else {
                console.log("[ERROR] failed to get user info: null data");
                bot.sendMessage(
                  chatId,
                  "gagal mendapatkan info user. silakan coba lagi."
                );
              }
            } catch (error) {
              console.log("[ERROR] failed to get user info:", error.message);
              bot.sendMessage(
                chatId,
                "gagal mendapatkan info user. silakan coba lagi."
              );
            }

            clearInterval(intervalId);
            userSessions.delete(chatId);
          }
        }
      }, 1000);

      const qrcodeBase64 = qrData.qrcode_base64;
      bot.sendPhoto(chatId, Buffer.from(qrcodeBase64, "base64"), {
        caption: "scan qr code di atas dengan aplikasi shopee.",
      });
    } else {
      bot.sendMessage(chatId, "gagal mengambil data qr code.");
      userSessions.delete(chatId);
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "terjadi kesalahan saat memproses permintaan.");
    userSessions.delete(chatId);
  }
}

async function claimVoucherWithCookie(chatId, selectedVoucher, cookie) {
  try {
    const voucherData = vouchers[selectedVoucher];
    bot.sendMessage(chatId, `mencoba mengklaim voucher ${selectedVoucher}...`);

    const saveVoucherResponse = await axios.post(
      "https://mall.shopee.co.id/api/v2/voucher_wallet/save_voucher",
      {
        voucher_promotionid: voucherData.promotionId,
        signature: voucherData.signature,
        security_device_fingerprint: "",
        signature_source: "0",
      },
      {
        headers: {
          Cookie: cookie,
          Accept: "application/json",
          "Af-Ac-Enc-Dat": "",
          "Af-Ac-Enc-Id": "",
          "Af-Ac-Enc-Sz-Token": "",
          "If-None-Match-": "55b03-97d86fe6888b54a9c5bfa268cf3d922f",
          Shopee_http_dns_mode: "1",
          "User-Agent": "Android app Shopee appver=30420 app_type=1",
          "X-Api-Source": "rn",
          "X-Sap-Access-F": "",
          "X-Sap-Access-T": "",
          "X-Shopee-Client-Timezone": "Asia/Jakarta",
          "X-Csrftoken": "",
          "Content-Type": "application/json; charset=utf-8",
          "Accept-Encoding": "gzip, deflate, br",
        },
      }
    );

    let currentAccount = "Unknown";
    if (userData[chatId] && userData[chatId].accounts) {
      const accountIndex = userData[chatId].selectedAccountIndex || 0;
      if (userData[chatId].accounts[accountIndex]) {
        currentAccount = userData[chatId].accounts[accountIndex].shopeeUsername;
      }
    }

    if (saveVoucherResponse.data.error === 0) {
      console.log(
        `[SUCCESS] voucher ${selectedVoucher} claimed by user: ${currentAccount}`
      );
      bot.sendMessage(
        chatId,
        `voucher ${selectedVoucher} berhasil diklaim.\nusername: ${currentAccount}`
      );
    } else {
      const errorMsg = saveVoucherResponse.data.error_msg;
      console.log("[ERROR] failed to claim voucher:", errorMsg);
      bot.sendMessage(
        chatId,
        `gagal mengklaim voucher: ${errorMsg.toLowerCase()}`
      );

      if (
        errorMsg.toLowerCase().includes("login") ||
        errorMsg.toLowerCase().includes("session")
      ) {
        bot.sendMessage(
          chatId,
          "cookie akun ini mungkin telah kedaluwarsa. silakan login kembali dengan akun ini."
        );

        if (userData[chatId] && userData[chatId].accounts) {
          const accountIndex = userData[chatId].selectedAccountIndex || 0;
          if (userData[chatId].accounts[accountIndex]) {
            userData[chatId].accounts[accountIndex].expired = true;
            saveUserData();
          }
        }
      }
    }
  } catch (error) {
    console.error("Error claiming voucher:", error);
    bot.sendMessage(
      chatId,
      "terjadi kesalahan saat mengklaim voucher. cookie mungkin telah kedaluwarsa, silakan login kembali."
    );

    if (userData[chatId] && userData[chatId].accounts) {
      const accountIndex = userData[chatId].selectedAccountIndex || 0;
      if (userData[chatId].accounts[accountIndex]) {
        userData[chatId].accounts[accountIndex].expired = true;
        saveUserData();
      }
    }
  }
}
