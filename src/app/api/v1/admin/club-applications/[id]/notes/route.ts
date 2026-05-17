import { addReviewerNote } from "@/server/actions/clubApplicationsAdmin";
import { adminTransition } from "../transitions/_helper";

export const POST = adminTransition(addReviewerNote);
