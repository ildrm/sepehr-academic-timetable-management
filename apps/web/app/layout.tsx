import type { Metadata } from 'next';
import './styles.css';
export const metadata:Metadata={title:'سپهر | سامانه آموزش دانشگاهی',description:'پرتال آموزشی و انتخاب واحد'};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="fa" dir="rtl"><body><a className="skip" href="#main">رفتن به محتوای اصلی</a>{children}</body></html>;
}
