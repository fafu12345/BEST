export const contactRoles={landlord:'임대인',tenant:'임차인',seller:'매도인',buyer:'매수인',resident:'거주자',other:'기타'} as const;
export type ContactRole=keyof typeof contactRoles;
