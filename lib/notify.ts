import nodemailer from 'nodemailer';

// Supports multiple recipients — comma-separated in env var
// e.g. ADMIN_NOTIFY_EMAIL="owner@gmail.com,manager@gmail.com"
const ADMIN_EMAIL    = process.env.ADMIN_NOTIFY_EMAIL ?? '';
const GMAIL_USER     = process.env.GMAIL_USER ?? '';
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASSWORD ?? '';
const APP_URL        = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
});

export interface BookingNotifyPayload {
  bookingId:        string;
  customerName:     string;
  customerEmail?:   string | null;
  customerPhone?:   string | null;
  stationName:      string;
  date:             string;
  startTime:        string;
  endTime:          string;
  duration:         number;
  totalPrice:       number;
  discount:         number;
  bookingType:      string;
  extraControllers: number;
  notes?:           string | null;
}

export interface ArtifactAwardEmailPayload {
  customerName: string;
  customerEmail: string;
  artifactName: string;
  setName: string;
  rarity: string;
  slotType: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function artifactSlotLabel(slotType: string) {
  return slotType.charAt(0) + slotType.slice(1).toLowerCase();
}

function fmt(time: string) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export async function notifyAdminNewBooking(payload: BookingNotifyPayload) {
  if (!ADMIN_EMAIL || !GMAIL_USER || !GMAIL_APP_PASS) return; // skip if not configured

  const {
    bookingId, customerName, customerEmail, customerPhone,
    stationName, date, startTime, endTime, duration,
    totalPrice, discount, bookingType, extraControllers, notes,
  } = payload;

  const priceDisplay = discount > 0
    ? `₹${totalPrice} (${discount}% discount applied)`
    : `₹${totalPrice}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e5e7eb;border-radius:12px;overflow:hidden;border:1px solid #2d2d4e;">
      <div style="background:linear-gradient(135deg,#6c63ff,#00e676);padding:24px 28px;text-align:center;">
        ${APP_URL ? `<img src="${APP_URL}/images/logoImage.png" alt="EMI Guild" style="height:56px;margin-bottom:12px;object-fit:contain;" />` : ''}
        <h1 style="margin:0;font-size:1.3rem;color:#fff;font-weight:800;letter-spacing:1px;">🎮 New Booking — EMI Guild</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">${bookingType === 'OFFLINE' ? 'Walk-in / Offline' : 'Online'} booking received</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <tr><td style="padding:8px 0;color:#9ca3af;width:140px;">Booking ID</td><td style="padding:8px 0;font-weight:600;color:#c4b5fd;">#${bookingId.slice(-8).toUpperCase()}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Customer</td><td style="padding:8px 0;font-weight:600;">${customerName}</td></tr>
          ${customerEmail ? `<tr><td style="padding:8px 0;color:#9ca3af;">Email</td><td style="padding:8px 0;">${customerEmail}</td></tr>` : ''}
          ${customerPhone ? `<tr><td style="padding:8px 0;color:#9ca3af;">Phone</td><td style="padding:8px 0;">${customerPhone}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#9ca3af;">Station</td><td style="padding:8px 0;font-weight:600;">${stationName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Date</td><td style="padding:8px 0;">${date}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Time</td><td style="padding:8px 0;">${fmt(startTime)} → ${fmt(endTime)} (${duration}h)</td></tr>
          ${extraControllers > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;">Controllers</td><td style="padding:8px 0;">+${extraControllers}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#9ca3af;">Total</td><td style="padding:8px 0;font-weight:700;font-size:1rem;color:#00e676;">${priceDisplay}</td></tr>
          ${notes ? `<tr><td style="padding:8px 0;color:#9ca3af;vertical-align:top;">Notes</td><td style="padding:8px 0;font-style:italic;color:#d1d5db;">${notes}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:16px 28px;background:#0a0a14;font-size:0.75rem;color:#4b5563;text-align:center;">
        Automated notification from EMI Guild Booking System.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from:    `"EMI Guild Bookings" <${GMAIL_USER}>`,
      to:      ADMIN_EMAIL,
      subject: `🎮 New Booking: ${customerName} → ${stationName} on ${date}`,
      html,
    });
  } catch (err) {
    console.error('[notify] Failed to send admin email:', err);
  }
}

export async function notifyUserArtifactAward(payload: ArtifactAwardEmailPayload) {
  if (!GMAIL_USER || !GMAIL_APP_PASS || !payload.customerEmail) return;

  const rarityColors: Record<string, string> = {
    PLATINUM: '#c7a7ff',
    GOLD: '#f4cf58',
    SILVER: '#8edbed',
    BRONZE: '#d58a52',
  };
  const customerName = escapeHtml(payload.customerName);
  const artifactName = escapeHtml(payload.artifactName);
  const setName = escapeHtml(payload.setName);
  const rarity = escapeHtml(payload.rarity);
  const slot = escapeHtml(artifactSlotLabel(payload.slotType));
  const rarityColor = rarityColors[payload.rarity] ?? '#c4b5fd';
  const siteUrl = APP_URL || 'https://emiguild.in';
  const armoryUrl = `${siteUrl}/armory`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e5e7eb;border-radius:12px;overflow:hidden;border:1px solid #2d2d4e;">
      <div style="padding:24px 28px;text-align:center;background:#17172a;border-bottom:3px solid ${rarityColor};">
        ${APP_URL ? `<img src="${APP_URL}/images/logoImage.png" alt="EMI Guild" style="height:56px;margin-bottom:12px;object-fit:contain;" />` : ''}
        <p style="margin:0 0 8px;color:${rarityColor};font-size:0.78rem;font-weight:800;text-transform:uppercase;">⚔️ Legendary Reward Acquired</p>
        <h1 style="margin:0;color:#fff;font-size:1.35rem;">${artifactName}</h1>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 12px;line-height:1.6;">Hi ${customerName}, your check-in just paid off.</p>
        <p style="margin:0 0 20px;line-height:1.6;">A <strong style="color:${rarityColor};">${rarity} artifact</strong> has been added to your EmiGuild Armory. Collect the remaining pieces, complete the ${setName}, and unlock the ultimate reward.</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:22px;">
          <tr><td style="padding:8px 0;color:#9ca3af;width:120px;">Artifact</td><td style="padding:8px 0;font-weight:700;color:${rarityColor};">${artifactName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Set</td><td style="padding:8px 0;">${setName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Rarity</td><td style="padding:8px 0;color:${rarityColor};font-weight:700;">${rarity}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Slot</td><td style="padding:8px 0;">${slot}</td></tr>
        </table>
        <p style="margin:0 0 20px;text-align:center;font-weight:700;line-height:1.5;color:${rarityColor};">Your next legendary drop could be one check-in away.</p>
        <div style="text-align:center;">
          <a href="${armoryUrl}" style="display:inline-block;padding:12px 20px;background:${rarityColor};color:#0b0b12;text-decoration:none;border-radius:6px;font-weight:800;">VIEW MY ARMORY</a>
        </div>
      </div>
      <div style="padding:14px 28px;background:#0a0a14;font-size:0.75rem;color:#6b7280;text-align:center;">
        Your artifact remains in your inventory even if the booking is later cancelled.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"EMI Guild Armory" <${GMAIL_USER}>`,
      to: payload.customerEmail,
      subject: `${payload.rarity} artifact unlocked: ${payload.artifactName}`,
      html,
    });
  } catch (err) {
    console.error('[notify] Failed to send artifact award email:', err);
  }
}
