"""POST /api/translate — library texts in the app language (QA #43)."""
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import get_db
from app.schemas.auth import UserResponse
from app.services import translate as svc

router = APIRouter(tags=["Translate"])


class TranslateIn(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=80)
    lang: str = Field(..., min_length=2, max_length=5)
    # "en" (library texts), or "auto" for names whose language varies (food products, wger exercises).
    src_lang: str = Field("en", min_length=2, max_length=5)


@router.post("/translate")
def translate_texts(body: TranslateIn, current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    texts = [t[:2000] for t in body.texts]
    return svc.translate(db, current_user.id, texts, body.lang, body.src_lang)
