// Resend's HTTP API — nodemailer (raw SMTP over net/tls sockets) doesn't
// work on Cloudflare Workers, which only allow outbound fetch().
const RESEND_API_URL = 'https://api.resend.com/emails';

// Exported for api/admin/orders.js's broadcast-email feature, which needs
// `bcc` for sending one message to many recipients without exposing their
// addresses to each other.
export async function sendViaResend({ to, bcc, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Siri Traders <notifications@siritrader.com>';

  if (!apiKey) {
    console.warn('[EMAIL] RESEND_API_KEY not configured. Logging email content instead:');
    console.log('[EMAIL SUBJECT]:', subject);
    console.log('[EMAIL CONTENT]:', text || html);
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, bcc, subject, text, html }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[EMAIL] Resend returned ${res.status}:`, errBody);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[EMAIL] Failed to send via Resend:', error.message);
    return false;
  }
}

export async function sendOrderNotificationEmail(order, items) {
  const adminEmail = process.env.ADMIN_EMAIL || 'siritraders250925@gmail.com';

  const itemsListText = items.map(item => {
    const qty = item.qty || item.quantity || 1;
    const weightInfo = item.weight ? ` (${item.weight})` : '';
    return `- ${item.name}${weightInfo} x${qty} - ₹${item.price * qty}`;
  }).join('\n');

  const subject = `🔔 New Order Placed: Order #${order.id} - ₹${order.total}`;
  const text = `
Hello Admin,

A new order has been placed on Siri Traders!

Order Details:
----------------------------------------
Order ID: #${order.id}
Payment Method: ${String(order.paymentMethod).toUpperCase()}
Total Amount: ₹${order.total}
Delivery Address: ${order.deliveryAddress}

Items Ordered:
----------------------------------------
${itemsListText}

Please log in to the admin dashboard at https://www.siritrader.com/admin to view and process this order.

Best regards,
Siri Traders Notifications
`;

  console.log(`[EMAIL] Attempting to send notification for order #${order.id} to ${adminEmail}`);
  return sendViaResend({ to: adminEmail, subject, text });
}

export async function sendCustomerOrderConfirmationEmail(customerEmail, customerName, order, items) {
  const itemsListHtml = items.map(item => {
    const qty = item.qty || item.quantity || 1;
    const weightInfo = item.weight ? ` (${item.weight})` : '';
    return `<li style="padding: 6px 0; border-bottom: 1px dashed #e5e7eb; font-size: 14px;">
      <strong>${item.name}${weightInfo}</strong> x${qty} - <span style="font-weight: bold;">₹${item.price * qty}</span>
    </li>`;
  }).join('');

  const subject = `🛍️ Order Confirmed! Siri Traders Order #${order.id}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #faf9f6;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d5016;">
        <h1 style="color: #2d5016; margin: 0; font-size: 24px; letter-spacing: 0.5px;">SIRI TRADERS</h1>
        <p style="color: #687466; margin: 4px 0 0; font-size: 13px;">Your Order is Confirmed!</p>
      </div>

      <div style="color: #1f2937; font-size: 15px; line-height: 1.6;">
        <p>Dear ${customerName || 'Customer'},</p>
        <p>Thank you for shopping with us! We have received your order and are processing it right away.</p>

        <div style="background-color: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2d5016; font-size: 16px;">Order Summary</h3>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Order ID:</strong> #ORD-${order.id}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Payment Method:</strong> ${String(order.paymentMethod).toUpperCase()}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>

          <ul style="list-style-type: none; padding: 0; margin: 16px 0 0;">
            ${itemsListHtml}
          </ul>

          <p style="text-align: right; margin-top: 16px; margin-bottom: 0; font-size: 16px; font-weight: bold; color: #2d5016;">
            Total Amount: ₹${order.total}
          </p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="https://www.siritrader.com/profile" style="display: inline-block; background-color: #2d5016; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Track Your Order</a>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">
          If you have any questions, feel free to contact us at siritaders250925@gmail.com
        </p>
      </div>
    </div>
  `;

  return sendViaResend({ to: customerEmail, subject, html: htmlContent });
}

export async function sendAdminWelcomeEmail(admin, plainPassword) {
  const subject = `Welcome to the Siri Traders Admin Team — ${admin.role}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #faf9f6;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d5016;">
        <h1 style="color: #2d5016; margin: 0; font-size: 24px; letter-spacing: 0.5px;">SIRI TRADERS</h1>
        <p style="color: #687466; margin: 4px 0 0; font-size: 13px;">Admin Control Panel Access</p>
      </div>

      <div style="color: #1f2937; font-size: 15px; line-height: 1.6;">
        <p>Hi ${admin.name || 'there'},</p>
        <p>You've been added to the Siri Traders admin team as <strong>${admin.role}</strong>. Here are your login credentials:</p>

        <div style="background-color: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="margin: 4px 0; font-size: 13px;"><strong>Email:</strong> ${admin.email}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Password:</strong> <code style="background: #F1F8E9; padding: 2px 6px; border-radius: 4px;">${plainPassword}</code></p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Role:</strong> ${admin.role}</p>
        </div>

        <p style="font-size: 13px; color: #687466;">For security, please sign in and treat this password as confidential. Contact the site owner if you didn't expect this email.</p>
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="https://www.siritrader.com/admin-login" style="display: inline-block; background-color: #2d5016; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Sign In to Admin Panel</a>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">
          Siri Traders — Fast & Reliable Grocery Delivery
        </p>
      </div>
    </div>
  `;

  return sendViaResend({ to: admin.email, subject, html: htmlContent });
}

export async function sendAdminPasswordChangedEmail(admin, plainPassword) {
  const subject = `Your Siri Traders Admin Password Was Changed`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #faf9f6;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d5016;">
        <h1 style="color: #2d5016; margin: 0; font-size: 24px; letter-spacing: 0.5px;">SIRI TRADERS</h1>
        <p style="color: #687466; margin: 4px 0 0; font-size: 13px;">Admin Control Panel Access</p>
      </div>

      <div style="color: #1f2937; font-size: 15px; line-height: 1.6;">
        <p>Hi ${admin.name || 'there'},</p>
        <p>Your Siri Traders admin password was just changed by another admin. Your new login credentials are:</p>

        <div style="background-color: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="margin: 4px 0; font-size: 13px;"><strong>Email:</strong> ${admin.email}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>New Password:</strong> <code style="background: #F1F8E9; padding: 2px 6px; border-radius: 4px;">${plainPassword}</code></p>
        </div>

        <p style="font-size: 13px; color: #687466;">If you didn't expect this change, contact the site owner immediately.</p>
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="https://www.siritrader.com/admin-login" style="display: inline-block; background-color: #2d5016; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Sign In to Admin Panel</a>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">
          Siri Traders — Fast & Reliable Grocery Delivery
        </p>
      </div>
    </div>
  `;

  return sendViaResend({ to: admin.email, subject, html: htmlContent });
}

export async function sendCustomerOrderStatusUpdateEmail(customerEmail, customerName, order, status) {
  let statusMsg = '';
  let icon = '📦';
  let showFeedback = false;

  if (status === 'Preparing') {
    statusMsg = 'is now being prepared and packed with care.';
    icon = '👨‍🍳';
  } else if (status === 'In Transit') {
    statusMsg = 'is out for delivery and on its way to your address!';
    icon = '🚚';
  } else if (status === 'Delivered') {
    statusMsg = 'has been successfully delivered! Thank you for ordering from us.';
    icon = '✅';
    showFeedback = true;
  } else if (status === 'Paid') {
    statusMsg = 'payment has been verified and processed.';
    icon = '💳';
  } else {
    statusMsg = `status has been updated to ${status}.`;
  }

  const subject = `${icon} Order #${order.id} Update: ${status}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #faf9f6;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d5016;">
        <h1 style="color: #2d5016; margin: 0; font-size: 24px; letter-spacing: 0.5px;">SIRI TRADERS</h1>
        <p style="color: #687466; margin: 4px 0 0; font-size: 13px;">Order Status Notification</p>
      </div>

      <div style="color: #1f2937; font-size: 15px; line-height: 1.6;">
        <p>Dear ${customerName || 'Customer'},</p>
        <p>Your order <strong>#ORD-${order.id}</strong> ${statusMsg}</p>

        <div style="background-color: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0; text-align: center;">
          <span style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #687466; font-weight: bold;">Current Status</span>
          <h2 style="color: #2d5016; margin: 6px 0 0; font-size: 22px;">${status}</h2>
        </div>

        ${showFeedback ? `
          <div style="margin: 28px 0; padding: 20px; background-color: #FFF8DF; border: 1px dashed #2d5016; border-radius: 8px; text-align: center;">
            <h3 style="margin-top: 0; color: #2d5016; font-size: 16px;">We value your feedback! ❤️</h3>
            <p style="font-size: 14px; margin-bottom: 16px; color: #1f2937;">
              Please let us know how your delivery experience was. Your feedback helps us improve our service!
            </p>
            <a href="https://www.siritrader.com/profile" style="display: inline-block; background-color: #2d5016; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">Provide Feedback</a>
          </div>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="https://www.siritrader.com/profile" style="display: inline-block; background-color: #2d5016; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">View Order History</a>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">
          Siri Traders — Fast & Reliable Grocery Delivery
        </p>
      </div>
    </div>
  `;

  return sendViaResend({ to: customerEmail, subject, html: htmlContent });
}
