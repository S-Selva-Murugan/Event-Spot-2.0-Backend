import { NextResponse } from "next/server";
import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

export async function POST(req: Request) {
  const { phoneNumber, code } = await req.json();

  if (!phoneNumber || !code) {
    return NextResponse.json({ error: "Phone number and code are required" }, { status: 400 });
  }

  try {
    const verification_check = await client.verify.v2.services(process.env.TWILIO_VERIFY_SID!)
      .verificationChecks
      .create({ to: phoneNumber, code });

    if (verification_check.status === "approved") {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, status: verification_check.status });
    }
  } catch (error: any) {
    console.error("OTP verification failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
