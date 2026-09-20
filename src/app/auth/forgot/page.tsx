import PasswordRecovery from "@/components/PasswordRecovery";
export default async function ForgotPassword({searchParams}:{searchParams:Promise<{expired?:string}>}){return <PasswordRecovery expired={(await searchParams).expired==="1"}/>;}
