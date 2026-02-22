const User = require("../models/user-model");
const Event = require("../models/event-model");
const Booking = require("../models/booking-model");

const analyticsCltr = {};

const getLastNDates = (days) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: days }).map((_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    return date;
  });
};

analyticsCltr.summary = async (req, res) => {
  try {
    const [totalUsers, totalEvents, totalBookings] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Booking.countDocuments(),
    ]);

    const [roleBreakdownRaw, eventStatusRaw, revenueRaw, upcomingEvents, topEventsRaw] = await Promise.all([
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
      Event.aggregate([
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $eq: ["$isApproved", true] }, then: "approved" },
                  { case: { $eq: ["$isApproved", false] }, then: "disapproved" },
                ],
                default: "pending",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Booking.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            paidBookings: {
              $sum: {
                $cond: [{ $in: ["$paymentStatus", ["paid", "authorized"]] }, 1, 0],
              },
            },
          },
        },
      ]),
      Event.countDocuments({
        date: { $gte: new Date() },
        isApproved: true,
      }),
      Booking.aggregate([
        {
          $group: {
            _id: "$eventId",
            bookings: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
            tickets: { $sum: "$tickets" },
          },
        },
        { $sort: { bookings: -1, revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "events",
            localField: "_id",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: {
            path: "$event",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            eventId: "$_id",
            eventName: { $ifNull: ["$event.eventName", "Deleted Event"] },
            bookings: 1,
            tickets: 1,
            revenue: 1,
          },
        },
      ]),
    ]);

    const roleBreakdown = roleBreakdownRaw.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      { admin: 0, customer: 0 }
    );

    const eventStatus = eventStatusRaw.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      { approved: 0, pending: 0, disapproved: 0 }
    );

    const last7Dates = getLastNDates(7);
    const trendStartDate = new Date(last7Dates[0]);

    const bookingTrendRaw = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: trendStartDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bookings: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const trendMap = bookingTrendRaw.reduce((acc, item) => {
      acc[item._id] = { bookings: item.bookings, revenue: item.revenue };
      return acc;
    }, {});

    const bookingTrend = last7Dates.map((date) => {
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        bookings: trendMap[key]?.bookings || 0,
        revenue: trendMap[key]?.revenue || 0,
      };
    });

    return res.json({
      summary: {
        totalUsers,
        totalEvents,
        totalBookings,
        totalRevenue: revenueRaw[0]?.totalRevenue || 0,
        successfulBookings: revenueRaw[0]?.paidBookings || 0,
        upcomingApprovedEvents: upcomingEvents,
      },
      roleBreakdown,
      eventStatus,
      bookingTrend,
      topEvents: topEventsRaw,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    return res.status(500).json({
      error: "Failed to fetch analytics data",
      details: err.message,
    });
  }
};

module.exports = analyticsCltr;
