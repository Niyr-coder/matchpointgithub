import { scheduleFieldVerification } from "@/server/actions/clubApplicationsAdmin";
import { adminTransition } from "../_helper";

export const POST = adminTransition(scheduleFieldVerification);
