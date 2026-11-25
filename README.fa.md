<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <strong>فارسی</strong> · <a href="https://irdcode.github.io/antigravity-context-monitor/">مستندات وب</a>
</p>

<p align="center">
  <img src="assets/hero-fa.svg" alt="مانیتور پنجره کانتکست آنتی‌گراویتی نسخه ۲ — نمایشگر ظرفیت مدل، محافظ فشرده‌سازی خودکار و تفکیک توکن" width="100%">
</p>

<div dir="rtl">

# مانیتور پنجره کانتکست آنتی‌گراویتی (Antigravity Context Monitor)

**نمایشگر لحظه‌ای ظرفیت Context Window سشن‌ها، محافظ فشرده‌سازی خودکار (`CHECKPOINT`)، تفکیک ۷ دسته‌ای مصرف توکن، وضعیت Prompt Cache، ردیابی Subagentهای ایزوله و محافظ تغییر مدل برای Google Antigravity Desktop (`v2.0.0`).**

برخلاف هارنس‌های تک‌حلقه‌ای مثل Claude Code، محیط Antigravity در حالت `Orchestrator` بین مدل برنامه‌ریزی و اجرا جابه‌جا می‌شود، کارهای سنگین را در Subagentهای ایزوله (`invoke_subagent`) اجرا می‌کند و نمایشگر کانتکست را در ظاهر برنامه پنهان نگه داشته است. با این حال موتور برنامه در فایل محلی هر سشن (`transcript.jsonl`) آمار دقیق API و نقاط فشرده‌سازی را ثبت می‌کند و این افزونه بدون هیچ ارتباط شبکه‌ای همان داده را زنده نمایش می‌دهد.

</div>

<p align="center">
  <img src="assets/architecture-fa.svg" alt="معماری سه‌لایه مانیتور کانتکست نسخه ۲ و حفاظت از اکانت" width="100%">
</p>

<div dir="rtl">

---

## تغییرات مهم در نسخه `2.0.0`

- **سازگاری کامل با Google Antigravity Desktop نسخه `2.34.0`:** پچر چندقلابی (`loadHubWindowUrl` + قلاب‌های نسخه‌های `2.32`/`2.33`) همراه با اثرانگشت `SHA-256` برای ارتقای خودکار در `--if-needed` و محافظ `WeakSet` علیه اتصال تکراری شنونده‌ها.
- **محافظ فشرده‌سازی خودکار (`CHECKPOINT`) و تفکیک بازگشت گام (`Rewinds`):** تشخیص دقیق فشرده‌سازی واقعی سشن (`# Resuming from a compaction`) با نادیده‌گرفتن چک‌پوینت مرورگر، تفکیک کامل `Compacts` (همراه با تاریخچه قبل به بعد) از `Rewinds` (تلاش مجدد/عقب‌گرد در `step_index`)، آستانه تطبیقی فشرده‌سازی (`~500k` روی مدل‌های `1M`، `840k` روی `claude-1m_840k` و `85%` روی `200k`/`128k`) و اسلایدر قابل تنظیم هشدار (`30–95%`).
- **۳۶ مدل داخلی + کشف خودکار مدل‌های آینده + سقف سفارشی:** پوشش کامل Gemini 4 Neon/Carbon/Hydrogen/Argon، Claude Opus/Sonnet 5.5 (شامل `Max` و تشخیص پویا برای `1M`/`840k`)، Gemini 3.x، GPT-OSS 120B/20B و حالت‌های Orchestrator همراه با کشف خودکار مدل‌های جدید از لاگ و UI و بخش تنظیمات برای تعریف سقف سفارشی (`customModels`).
- **منوی جستجوپذیر اختصاصی (`Combobox`) و چیدمان تک‌ستونه دراور:** حذف کامل `<select>` بومی سیستم‌عامل (رفع باگ لیست سفید در Electron ویندوز) با کامبوباکس دسترس‌پذیر (`role="combobox"`) دارای جستجو، میانبر کیبورد و عدم بسته‌شدن حین بروزرسانی زنده.
- **همگام‌سازی خودکار با تم روشن و تیره (`Light + Dark`):** خواندن مستقیم روشنایی `--background` و توکن‌های بومی Antigravity در هر دو سطح نوار بالا و Sidecar، با الگوی هاشور مونوکروم برای تفکیک مستقل از رنگ.
- **مدیریت دقیق سشن جدید (`empty_new`) و جابه‌جایی تب‌ها:** نمایش `0 / <tier> · Ready` در چت‌های تازه بدون نمایش اشتباه آمار سشن قبلی، نمایش تخمین اولیه پیش از نخستین پاسخ (`~<est>`) و آزادسازی خودکار پین دستی هنگام تغییر سشن.

---

## قابلیت‌های کلیدی

- **محاسبه دقیق از روی آمار واقعی API مدل:** ظرفیت فعال هر گام مستقیماً از آخرین `PLANNER_RESPONSE` برابر با `input_tokens + cache_read_tokens + output_tokens` خوانده می‌شود.
- **پشتیبانی از ۳۶ مدل داخلی و کشف خودکار مدل‌های آینده:**
  - **GPT-OSS (`128k` / فشرده‌سازی پیش‌فرض `108.8k` / تمرکز `80k`):** `gpt-oss-120b-medium` و `gpt-oss-20b`
  - **Claude Opus & Sonnet 5.5 (`200k` / فشرده‌سازی `170k` / تمرکز `120k` + پشتیبانی پویا از `1M`/`840k`):** `Max`، `High`، `Medium`، `Low`
  - **Gemini 4 (`Neon`, `Carbon`, `Hydrogen`, `Argon`)، Gemini 3.x و `Orchestrator` (`1M` / فشرده‌سازی `~500k` / تمرکز `150k`)**
- **تشخیص حالت دو‌فازی (Plan / Execute) و محافظ پاسکاری مدل‌ها:** تغییر واقعی مدل فقط از `<USER_SETTINGS_CHANGE>` در پیام کاربر استخراج می‌شود (در برابر شباهت‌های متنی داخل خروجی ابزارها مصون است) و پیش از انتقال سشن سنگین به مدل‌های `128k` یا `200k` هشدار سرریز می‌دهد.
- **تفکیک ۷ دسته‌ای توکن با جمع دقیق ۱۰۰٪:** نمایش سهم `System & Rules`، `MCP Servers & Tools`، `Skills & Plugins`، `Files & Codebase`، `Terminal & Tasks`، `Chat Messages` و `Reasoning & Subagents` همراه با پشتیبانی از لاگ‌های چرخیده، فشرده‌سازی `CHECKPOINT` و بازگشت `step_index`.
- **ردیابی کش، فشرده‌سازی و ساب‌ایجنت‌های ایزوله:** نمایش درصد Cache Hit، تعداد Cache Missها، شمارنده `Compacts` و `Rewinds` و میزان توکنی که توسط Subagentها از کانتکست اصلی خارج نگه داشته شده است.
- **نمایش دوگانه با کیت رابط یکپارچه:**
  1. نوار وضعیت زنده و دراور تک‌ستونه در هدر چت با میانبر **`Alt+C`** (`⌥C` در مک)
  2. افزونه رسمی پنل کناری در `sidecar/` (نصب خودکار در `~/.gemini/config/plugins/context-monitor`)

---

## پیش‌نیازها و راه‌اندازی سریع (ویندوز)

- **Google Antigravity Desktop** (تأییدشده روی نسخه **`2.34.0`** در ویندوز، سازگار با `2.32.x`–`2.33.x`)
- **Node.js نسخه ۲۰ یا بالاتر** (`winget install OpenJS.NodeJS.LTS`)

۱. روی فایل **`Launch-Antigravity-Context.bat`** دابل‌کلیک کنید تا `@electron/asar` (در صورت نیاز)، پچ نوار بالا و پلاگین Sidecar نصب یا ارتقا داده شده و برنامه اجرا شود.
۲. داخل برنامه با **`Alt+C`** (یا دکمه کانتکست در نوار بالا) داشبورد لحظه‌ای باز می‌شود.
۳. برای پنل تمام‌قد کناری: در منوی سمت چپ وارد **Customizations ← Installed** شوید، **Context Monitor** را فعال کنید و در هر سشن از **⋮ ← Extensions ← Context Window** بازش کنید.

### فایل‌های همراه

| فایل | کاربرد |
| :--- | :--- |
| `Launch-Antigravity-Context.bat` | بررسی سلامت و اثرانگشت پچ، اعمال/ارتقای خودکار پچ + همگام‌سازی Sidecar و اجرای `Antigravity.exe` |
| `Diagnose-Antigravity-Context.bat` | عیب‌یابی غیرمخرب (`doctor`) بدون تغییر فایل‌ها |
| `Restore-Antigravity-Context.bat` | حذف تمیز افزونه و بازگشت کامل به حالت اصلی |

---

## دستورات خط فرمان و توسعه

</div>

```bash
npm install --omit=dev
npm run doctor                 # بررسی سلامت بدون تغییر فایل
npm run patch                  # اعمال پچ روی app.asar و نصب پلاگین Sidecar
npm run sync                   # همگام‌سازی سریع کدهای Sidecar هنگام توسعه بدون دست‌زدن به app.asar
npm run analyze -- --json      # مشاهده خروجی تحلیلگر سشن در ترمینال
npm run restore                # حذف افزونه از app.asar و پلاگین
npm test                       # اجرای کامل ۱۳ مجموعه تست خودکار
```

<div dir="rtl">

---

## امنیت و اطمینان از سلامت اکانت

- **فقط خواندنی و کاملاً آفلاین:** هیچ درخواستی به اینترنت ارسال نمی‌شود و هیچ تغییری در پرامپت‌ها، هدرها یا ترافیک احراز هویت مدل‌ها ایجاد نمی‌گردد.
- **قفل مبدأ (`Origin Guard`) و پاک‌سازی تنظیمات:** اسکریپت تزریقی و ذخیره تنظیمات `~/.antigravity-context-monitor.json` (شامل `customModels` و `compactWarnPct`) منحصراً روی مبدأ محلی `127.0.0.1` اجرا و پاک‌سازی می‌شوند.

---

## لایسنس

منتشرشده تحت **لایسنس MIT** (`Copyright (c) 2026 Kiarash Javanbakht (IRDcode)`) — جزئیات در [LICENSE](LICENSE) و [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

</div>
