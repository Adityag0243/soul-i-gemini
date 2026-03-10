import { Router } from 'express';
import signupRoute from './signup';
import signinRoute from './signin';
import signoutRoute from './signout';
import refreshTokenRouter from './token';

const router = Router();

router.use('/signup', signupRoute);
router.use('/signin', signinRoute);
router.use('/signout', signoutRoute);
router.use('/token', refreshTokenRouter);

export default router;
