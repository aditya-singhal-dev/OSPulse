from typing import Literal

from pydantic import BaseModel, Field, ConfigDict, FiniteFloat


class Settings(BaseModel):
    interval: float = Field(2, ge=1, le=10)
    sustain: int = Field(30, ge=10, le=300)
    cpu: int = Field(85, ge=1, le=100)
    memory: int = Field(85, ge=1, le=100)
    swap: int = Field(50, ge=1, le=100)
    disk: int = Field(90, ge=1, le=100)
    io: int = Field(150, ge=1, le=10000)


class ProcessAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    create_time: FiniteFloat = Field(gt=0)
    confirmed: Literal[True]
    priority: int | None = Field(None, ge=-20, le=19)


class ExperimentRequest(BaseModel):
    kind: Literal["cpu", "memory", "threads", "multiprocessing", "lifecycle", "race", "buffer", "deadlock"]
    duration: int = Field(12, ge=3, le=30)
    memory: int = Field(64, ge=1, le=256)


class LifecycleAction(BaseModel):
    action: Literal["suspend", "resume", "terminate"]
