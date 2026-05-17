import { rejectApplication } from "@/server/actions/clubApplicationsAdmin";
import { adminTransition } from "../_helper";

export const POST = adminTransition(rejectApplication);
