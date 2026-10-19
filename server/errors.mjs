export class Problem extends Error {
 constructor(status,message,extra={}) {super(message);this.status=status;this.extra=extra;}
}
export const requireValue=(ok,message)=>{if(!ok)throw new Problem(400,message);};
