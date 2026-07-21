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
  passType?:        string | null;
  passHoursDeducted?: number;
  notes?:           string | null;
}

export interface ArtifactAwardEmailPayload {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  stationName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  artifactName: string;
  setName: string;
  rarity: string;
  slotType: string;
}

export type UserBookingEmailPayload = Omit<BookingNotifyPayload, 'customerEmail'> & {
  customerEmail: string;
  paymentStatus: string;
};

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

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function googleCalendarDate(date: string, time: string) {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

function escapeCalendarText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function bookingCalendarInvite(payload: UserBookingEmailPayload, bookingsUrl: string) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const description = [
    `Booking #${payload.bookingId.slice(-8).toUpperCase()}`,
    `${payload.duration} hour session at ${payload.stationName}`,
    `View booking: ${bookingsUrl}`,
    'Map: https://maps.app.goo.gl/BguSp1D4LwCuX2PD9',
  ].join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EmiGuild//Booking System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(payload.bookingId)}@emiguild.in`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;TZID=Asia/Kolkata:${googleCalendarDate(payload.date, payload.startTime)}`,
    `DTEND;TZID=Asia/Kolkata:${googleCalendarDate(payload.date, payload.endTime)}`,
    `SUMMARY:${escapeCalendarText(`EmiGuild Gaming Session - ${payload.stationName}`)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'LOCATION:EmiGuild Gaming Cafe\, Kothapet\, Hyderabad',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function notifyAdminNewBooking(payload: BookingNotifyPayload) {
  if (!ADMIN_EMAIL || !GMAIL_USER || !GMAIL_APP_PASS) return; // skip if not configured

  const {
    bookingId, customerName, customerEmail, customerPhone,
    stationName, date, startTime, endTime, duration,
    totalPrice, discount, bookingType, extraControllers,
    passType, passHoursDeducted, notes,
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
          ${passType && passHoursDeducted ? `<tr><td style="padding:8px 0;color:#9ca3af;">Payment</td><td style="padding:8px 0;font-weight:700;color:#00e676;">${passType} Pass · ${passHoursDeducted}h used</td></tr>` : ''}
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

export async function notifyUserNewBooking(payload: UserBookingEmailPayload) {
  if (!GMAIL_USER || !GMAIL_APP_PASS || !payload.customerEmail) return;

  const customerName = escapeHtml(payload.customerName);
  const stationName = escapeHtml(payload.stationName);
  const bookingId = escapeHtml(payload.bookingId.slice(-8).toUpperCase());
  const notes = payload.notes ? escapeHtml(payload.notes) : '';
  const siteUrl = APP_URL || 'https://emiguild.in';
  const bookingsUrl = `${siteUrl}/my-bookings`;
  const calendarInvite = bookingCalendarInvite(payload, bookingsUrl);
  const paymentLabel = payload.passType && payload.passHoursDeducted
    ? `${escapeHtml(payload.passType)} Pass · ${payload.passHoursDeducted}h used`
    : payload.paymentStatus === 'PAID' ? 'Paid' : 'Pay at counter';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e5e7eb;border-radius:12px;overflow:hidden;border:1px solid #2d2d4e;">
      <div style="background:linear-gradient(135deg,#6c63ff,#00e676);padding:24px 28px;text-align:center;">
        ${APP_URL ? `<img src="${APP_URL}/images/logoImage.png" alt="EMI Guild" style="height:56px;margin-bottom:12px;object-fit:contain;" />` : ''}
        <h1 style="margin:0;font-size:1.3rem;color:#fff;font-weight:800;letter-spacing:1px;">🎮 Booking Confirmed — EMI Guild</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">Your gaming session is reserved</p>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 18px;line-height:1.6;">Hi ${customerName}, your station is locked in. We’ll have it ready for you.</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <tr><td style="padding:8px 0;color:#9ca3af;width:140px;">Booking ID</td><td style="padding:8px 0;font-weight:600;color:#c4b5fd;">#${bookingId}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Station</td><td style="padding:8px 0;font-weight:600;">${stationName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Date</td><td style="padding:8px 0;">${fmtDate(payload.date)}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Time</td><td style="padding:8px 0;">${fmt(payload.startTime)} → ${fmt(payload.endTime)} (${payload.duration}h)</td></tr>
          ${payload.extraControllers > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;">Extra Controllers</td><td style="padding:8px 0;">${payload.extraControllers}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#9ca3af;">Payment</td><td style="padding:8px 0;">${paymentLabel}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Total</td><td style="padding:8px 0;font-weight:700;font-size:1rem;color:#00e676;">₹${payload.totalPrice}</td></tr>
          ${notes ? `<tr><td style="padding:8px 0;color:#9ca3af;vertical-align:top;">Notes</td><td style="padding:8px 0;font-style:italic;color:#d1d5db;">${notes}</td></tr>` : ''}
        </table>
        <p style="margin:20px 0;text-align:center;color:#d1d5db;line-height:1.55;">Arrive a few minutes early and step straight into the game.</p>
        <div style="text-align:center;">
          <a href="${bookingsUrl}" style="display:inline-block;margin:4px;padding:12px 20px;background:#00e676;color:#0b0b12;text-decoration:none;border-radius:6px;font-weight:800;">VIEW MY BOOKINGS</a>
        </div>
      </div>
      <div style="padding:16px 28px;background:#0a0a14;font-size:0.75rem;color:#4b5563;text-align:center;">
        Automated confirmation from EMI Guild Booking System.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"EMI Guild Bookings" <${GMAIL_USER}>`,
      to: payload.customerEmail,
      subject: `Booking confirmed: ${payload.stationName} on ${fmtDate(payload.date)}`,
      html,
      icalEvent: {
        filename: `emiguild-booking-${bookingId}.ics`,
        method: 'PUBLISH',
        content: calendarInvite,
      },
    });
  } catch (err) {
    console.error('[notify] Failed to send customer booking email:', err);
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
  const stationName = escapeHtml(payload.stationName);
  const artifactName = escapeHtml(payload.artifactName);
  const setName = escapeHtml(payload.setName);
  const rarity = escapeHtml(payload.rarity);
  const slot = escapeHtml(artifactSlotLabel(payload.slotType));
  const bookingId = escapeHtml(payload.bookingId.slice(-8).toUpperCase());
  const rarityColor = rarityColors[payload.rarity] ?? '#c4b5fd';
  const siteUrl = APP_URL || 'https://emiguild.in';
  const armoryUrl = `${siteUrl}/armory`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e5e7eb;border-radius:12px;overflow:hidden;border:1px solid #2d2d4e;">
      <div style="background:linear-gradient(135deg,#6c63ff,#00e676);padding:24px 28px;text-align:center;">
        ${APP_URL ? `<img src="${APP_URL}/images/logoImage.png" alt="EMI Guild" style="height:56px;margin-bottom:12px;object-fit:contain;" />` : ''}
        <h1 style="margin:0;font-size:1.3rem;color:#fff;font-weight:800;letter-spacing:1px;">⚔️ Check-In Reward — ${artifactName}</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">${fmt(payload.startTime)} → ${fmt(payload.endTime)} session checked in</p>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 18px;line-height:1.6;">Hi ${customerName}, your check-in just paid off.</p>
        <p style="margin:0 0 8px;color:#9ca3af;font-size:0.72rem;font-weight:800;text-transform:uppercase;">Booking Details</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:22px;">
          <tr><td style="padding:7px 0;color:#9ca3af;width:120px;">Booking</td><td style="padding:7px 0;font-weight:700;">#${bookingId}</td></tr>
          <tr><td style="padding:7px 0;color:#9ca3af;">Station</td><td style="padding:7px 0;">${stationName}</td></tr>
          <tr><td style="padding:7px 0;color:#9ca3af;">Date</td><td style="padding:7px 0;">${fmtDate(payload.date)}</td></tr>
          <tr><td style="padding:7px 0;color:#9ca3af;">Session</td><td style="padding:7px 0;">${fmt(payload.startTime)} – ${fmt(payload.endTime)} (${payload.duration}h)</td></tr>
        </table>
        <p style="margin:0 0 6px;color:${rarityColor};font-size:0.72rem;font-weight:800;text-transform:uppercase;">Your Check-In Drop</p>
        <h2 style="margin:0 0 14px;color:#fff;font-size:1.25rem;">${artifactName}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:22px;">
          <tr><td style="padding:8px 0;color:#9ca3af;width:120px;">Artifact</td><td style="padding:8px 0;font-weight:700;color:${rarityColor};">${artifactName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Set</td><td style="padding:8px 0;">${setName}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Rarity</td><td style="padding:8px 0;color:${rarityColor};font-weight:700;">${rarity}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Slot</td><td style="padding:8px 0;">${slot}</td></tr>
        </table>
        <p style="margin:0 0 20px;text-align:center;font-weight:700;line-height:1.55;color:${rarityColor};">One piece closer. Complete your sets for a chance to unlock a Bronze Pass (10 Hours).</p>
        <div style="text-align:center;">
          <a href="${armoryUrl}" style="display:inline-block;padding:12px 20px;background:${rarityColor};color:#0b0b12;text-decoration:none;border-radius:6px;font-weight:800;">VIEW MY ARMORY</a>
        </div>
      </div>
      <div style="padding:16px 28px;background:#0a0a14;font-size:0.75rem;color:#4b5563;text-align:center;">
        Automated reward notification from EMI Guild Booking System.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"EMI Guild Armory" <${GMAIL_USER}>`,
      to: payload.customerEmail,
      subject: `Checked in + ${payload.rarity} drop: ${payload.artifactName}`,
      html,
    });
  } catch (err) {
    console.error('[notify] Failed to send artifact award email:', err);
  }
}
