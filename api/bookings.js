// Simple solution: Send bookings via Formspree email and store locally for admin
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Send booking via email using Formspree
      const booking = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        status: 'pending',
        ...req.body
      };

      // Send email notification via Formspree
      try {
        await fetch('https://formspree.io/f/xdkogbpd', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: `New Ventra Booking - ${booking.service}`,
            message: `
New booking received:

Name: ${booking.name}
Phone: ${booking.phone}
Email: ${booking.email}
Service: ${booking.service}
Date: ${booking.date}
Time: ${booking.time}
Location: ${booking.location}
Address: ${booking.address || 'Drop-off'}
Price: $${booking.price}
Travel: $${booking.travelSurcharge || 0}
Total: $${booking.totalPrice}
Issue: ${booking.issue}

Booking ID: ${booking.id}
            `.trim()
          })
        });
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
        // Continue anyway - booking is still valid
      }

      // Return success - frontend will handle localStorage storage
      return res.status(201).json({
        success: true,
        id: booking.id,
        booking: booking
      });
    }

    if (req.method === 'GET') {
      // Return empty array - admin panel will use localStorage
      return res.status(200).json([]);
    }

    if (req.method === 'PATCH') {
      // Return success - admin panel will handle localStorage updates
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}