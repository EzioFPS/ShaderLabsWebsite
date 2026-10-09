import { z } from "zod";
import { contactOptions } from "./content";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  company: optionalText(120),
  website: optionalText(200).refine(
    (v) => !v || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(v),
    "Please enter a valid website, like example.com.",
  ),
  phone: optionalText(40).refine(
    (v) => !v || /^[+()\-.\s\d]{6,40}$/.test(v),
    "Please enter a valid phone number.",
  ),
  services: z
    .array(z.enum(contactOptions.services as [string, ...string[]]))
    .max(contactOptions.services.length)
    .default([]),
  budget: z
    .enum(contactOptions.budgets as [string, ...string[]])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little more: at least 20 characters.")
    .max(5000, "Please keep your message under 5,000 characters."),
  // Anti-spam fields
  fax: z.string().optional(), // honeypot: real people never see or fill this
  fillMs: z.number().optional(), // how long the form was open before sending, in ms
});
