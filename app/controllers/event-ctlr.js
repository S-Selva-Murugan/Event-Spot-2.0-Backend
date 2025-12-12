const Event = require("../models/event-model");
const uploadToS3 = require("../../utils/uploadToS3");
const { sendMail } = require("../../utils/email");


const eventCltr = {};

// ✅ Get all events
eventCltr.listAll = async (req, res) => {
  try {
    const { isApproved } = req.query;
    let filter = {};

    if (isApproved === "true") {
      filter.isApproved = true;
    } else if (isApproved === "false") {
      filter.isApproved = false;
    } else if (isApproved === "null") {
      filter.isApproved = null;
    }

    const events = await Event.find(filter);
    res.json(events);
  } catch (err) {
    console.error("Fetch events error:", err);
    res.status(500).json({ error: "Failed to fetch events", details: err });
  }
};

// ✅ Get all events created by the logged-in user
eventCltr.getMyEvents = async (req, res) => {
  try {
    const userId = req.user.cognitoId; // ✅ from the verified token
    const myEvents = await Event.find({ createdBy: userId });
    res.json(myEvents);
  } catch (err) {
    console.error("Error fetching user events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
};


// ✅ Create a new event
eventCltr.createEvent = async (req, res) => {
  try {
    // Upload all files to S3 and get URLs
    const photos = req.files
      ? await Promise.all(req.files.map((file) => uploadToS3(file)))
      : [];

    const newEvent = new Event({
      ...req.body,
      photos,
      createdBy: req.user.cognitoId || req.user._id,
    });

    await newEvent.save();
    res.json(newEvent);
  } catch (err) {
    console.error("Create event error:", err);
    res.status(400).json({ error: "Failed to create event", details: err });
  }
};

// ✅ Get a single event by ID
eventCltr.getEventById = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: "Invalid event ID", details: err });
  }
};

// eventCltr.updateEvent = async (req, res) => {
//   const { id } = req.params;

//   try {
//     // ✅ Prevent _id or other immutable fields from being updated
//     const updateData = { ...req.body };
//     delete updateData._id;
//     delete updateData.createdAt;

//     // ✅ Handle photo uploads if files are attached
//     if (req.files && req.files.length > 0) {
//       const uploadedUrls = [];

//       for (const file of req.files) {
//         const url = await uploadToS3(file); // your S3 upload utility
//         uploadedUrls.push(url);
//       }

//       // ✅ Replace existing photos (or append if needed)
//       updateData.photos = uploadedUrls;
//       // To append instead:
//       // const existingEvent = await Event.findById(id);
//       // updateData.photos = [...(existingEvent.photos || []), ...uploadedUrls];
//     }

//     // ✅ Update the event in MongoDB
//     const updatedEvent = await Event.findByIdAndUpdate(id, updateData, {
//       new: true,
//       runValidators: true,
//     });

//     if (!updatedEvent) {
//       return res.status(404).json({ error: "Event not found" });
//     }

//     // ✅ Send response
//     res.json({
//       message: "✅ Event updated successfully",
//       event: updatedEvent,
//     });
//   } catch (err) {
//     console.error("Update error:", err);
//     res.status(400).json({
//       error: "Failed to update event",
//       details: err.message || err,
//     });
//   }
// };

eventCltr.updateEvent = async (req, res) => {
  const { id } = req.params;

  try {
    // copy incoming body but never allow _id to be overwritten
    const updateData = { ...req.body };
    delete updateData._id; // ensure _id can't be changed

        if (updateData.isApproved === "null") {
      updateData.isApproved = null;
      updateData.suggestion = "";
    }

    // If photos are uploaded you might handle them earlier (file parsing)
    // e.g., if using multer: uploaded URLs might be in req.files and you set updateData.photos accordingly

    // Perform update
    const updatedEvent = await Event.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

if (updateData.isApproved === true && updatedEvent.contactEmail) {
  try {
    const subject = `Your event "${updatedEvent.eventName}" is approved 🎉`;

    const text = `
🎉 Your event "${updatedEvent.eventName}" has been approved and is now live on EventSpot.

Event details:
Date: ${new Date(updatedEvent.date).toLocaleString()}
Location: ${updatedEvent.location}

Thanks,
EventSpot Team
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>🎉 <strong>Your event "${updatedEvent.eventName}" has been approved and is now live on EventSpot.</strong></p>
        <p><strong>Event details:</strong><br/>
          Date: ${new Date(updatedEvent.date).toLocaleString()}<br/>
          Location: ${updatedEvent.location}
        </p>
        <p>Thanks,<br/><strong>EventSpot Team</strong></p>
      </div>
    `;

    await sendMail({ to: updatedEvent.contactEmail, subject, text, html });
    console.log(`✅ Approval email sent to ${updatedEvent.contactEmail}`);
  } catch (mailErr) {
    console.error("Failed to send approval email:", mailErr);
  }
}

// Send email if event is disapproved
if (updateData.isApproved === false && updatedEvent.contactEmail) {
  try {
    const subject = `Your event "${updatedEvent.eventName}" was not approved ❌`;

    const text = `
We regret to inform you that your event "${updatedEvent.eventName}" was not approved.

Reason:
${updateData.suggestion || "No specific reason provided."}

You can update your event and resubmit it for approval.

Thanks,
EventSpot Team
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>❌ <strong>Your event "${updatedEvent.eventName}" was not approved.</strong></p>
        <p><strong>Reason:</strong> ${updateData.suggestion || "No specific reason provided."}</p>
        <p>You can update your event and resubmit it for approval.</p>
        <p>Thanks,<br/><strong>EventSpot Team</strong></p>
      </div>
    `;

    await sendMail({ to: updatedEvent.contactEmail, subject, text, html });
    console.log(`📩 Disapproval email sent to ${updatedEvent.contactEmail}`);
  } catch (mailErr) {
    console.error("Failed to send disapproval email:", mailErr);
  }
}

    res.json({
      message: "Event updated successfully",
      event: updatedEvent,
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(400).json({ error: "Failed to update event", details: err });
  }
};

// ✅ Delete an event
eventCltr.deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedEvent = await Event.findByIdAndDelete(id);
    if (!deletedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json({
      message: "Event deleted successfully",
      event: deletedEvent,
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to delete event", details: err });
  }
};

module.exports = eventCltr;
