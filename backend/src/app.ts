import logger from './core/logger';
import express from 'express';
import cors from 'cors';
import { isProduction, originUrl } from './config';
import router from './routes/index';
import { errorHandler } from './middlewares/error.middleware';
import { NotFoundError } from './core/api-error';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { generateOpenAPIDocument } from './swagger-docs/swagger';

process.on('uncaughtException', (e) => {
    logger.error(e);
});

export const app = express();

app.use(express.json({ limit: '10mb' }));

app.use(
    express.urlencoded({
        limit: '10mb',
        extended: true,
        parameterLimit: 50000,
    }),
);

// allows cross origin reference
app.use(
    cors({
        origin: originUrl,
        optionsSuccessStatus: 200,
        credentials: true,
    }),
);
app.use(cookieParser());

//security header
app.use(helmet());

if (!isProduction) {
    app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(generateOpenAPIDocument(), {
            swaggerOptions: {
                persistAuthorization: true,
                tryItOutEnabled: true,
                displayRequestDuration: true,
            },
            customCss: '.swagger-ui .topbar { display: none }',
        }),
    );
}

// main routes
app.use('/', router);

app.use((_req, _res, next) => next(new NotFoundError()));
app.use(errorHandler);
